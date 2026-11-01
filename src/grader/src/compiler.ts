import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

export interface CompileResult {
  success: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  wallTimeMs: number;
}

export interface CompileOptions {
  sandboxUid: number;
  launcherPath: string;
  timeoutMs: number;
  cpuLimitS?: number;
  enablePch?: boolean;
  secretToScrub?: string;
}

export function sanitizeCompileMessage(
  rawMessage: string,
  secretToScrub?: string,
  runDir?: string
): string {
  let message = rawMessage;

  // 1. Scrub secret if present
  if (secretToScrub && secretToScrub.length >= 4) {
    message = message.split(secretToScrub).join('[REDACTED_SECRET]');
  }

  // Also scrub any GRADER_SECRET from env
  if (process.env.GRADER_SECRET && process.env.GRADER_SECRET.length >= 4) {
    message = message.split(process.env.GRADER_SECRET).join('[REDACTED_SECRET]');
  }

  // 2. Redact system file paths and sensitive contents (e.g. /etc/passwd, /proc/)
  const sensitivePatterns = [
    /\/etc\/(passwd|shadow|hosts|group|issue|os-release|resolv\.conf|hostname)/g,
    /\/proc\/[0-9a-zA-Z_.-]+\/[a-zA-Z0-9_.-]+/g,
    /\/proc\/[a-zA-Z0-9_.-]+/g,
    /\/sys\/[a-zA-Z0-9_./-]+/g,
  ];

  for (const pat of sensitivePatterns) {
    message = message.replace(pat, '[REDACTED_SYSTEM_PATH]');
  }

  // Filter out any lines that leak system accounts or file dumps
  const lines = message.split('\n');
  const filteredLines = lines.map((line) => {
    if (line.includes('root:') || line.includes('bin:') || line.includes('daemon:')) {
      return '[REDACTED_SYSTEM_CONTENT]';
    }
    return line;
  });
  message = filteredLines.join('\n');

  // If compiler output references system paths, outside files, or leaks system tokens,
  // replace entire message with safe user-friendly message without leaking file content or tokens
  if (
    message.includes('[REDACTED_SYSTEM_PATH]') ||
    message.includes('[REDACTED_SYSTEM_CONTENT]') ||
    /\/etc\/|\/proc\/|\/sys\/|\/dev\//.test(rawMessage) ||
    /root:|daemon:|bin:/.test(rawMessage) ||
    (rawMessage.includes('root') &&
      (rawMessage.includes('does not name a type') || rawMessage.includes('error:')))
  ) {
    return 'Không được include file ngoài bài nộp';
  }

  // 3. Replace run directory path or tmp paths with logical names
  if (runDir) {
    message = message.split(runDir + '/').join('');
    message = message.split(runDir).join('');
  }
  // Generic cleanup of /tmp/run_* paths
  message = message.replace(/\/tmp\/run_[A-Za-z0-9_.-]+\//g, '');
  message = message.replace(/\/tmp\/run_[A-Za-z0-9_.-]+/g, '');

  // 4. Limit to at most 2000 characters
  const MAX_MESSAGE_LEN = 2000;
  const TRUNCATE_SUFFIX = '\n...[TRUNCATED]';
  if (message.length > MAX_MESSAGE_LEN) {
    message = message.slice(0, MAX_MESSAGE_LEN - TRUNCATE_SUFFIX.length) + TRUNCATE_SUFFIX;
  }

  return message;
}

export async function compileCpp(
  runDir: string,
  sourceFiles: string[],
  binPath: string,
  options: CompileOptions
): Promise<CompileResult> {
  const { sandboxUid, launcherPath, timeoutMs, secretToScrub } = options;
  const cpuLimitS = options.cpuLimitS || Math.ceil(timeoutMs / 1000);
  const enablePch = options.enablePch !== false;
  const pchDir = '/usr/local/include/cppdsa_pch';
  const hasPch = enablePch && fs.existsSync(pchDir);

  // Prevent inclusion of arbitrary outside files before compilation
  for (const srcFile of sourceFiles) {
    if (fs.existsSync(srcFile)) {
      const content = fs.readFileSync(srcFile, 'utf-8');
      if (
        /#include\s*["<]\s*(\/|\.\.)/.test(content) ||
        /#include.*(\/etc\/|\/proc\/|\/sys\/|\/dev\/|etc\/passwd|environ|etc\/hostname)/.test(
          content
        )
      ) {
        return {
          success: false,
          code: 1,
          signal: null,
          output: 'Không được include file ngoài bài nộp',
          wallTimeMs: 0,
        };
      }
    }
  }

  const extraFlags: string[] = ['-std=c++17', '-O2'];
  if (hasPch) {
    extraFlags.push('-Winvalid-pch', `-I${pchDir}`);
  }

  const compileStart = performance.now();
  const useLauncher = fs.existsSync(launcherPath);
  let cmd: string;
  let args: string[];

  if (useLauncher) {
    cmd = launcherPath;
    args = [
      '--compiler-env',
      '--workdir',
      runDir,
      '--uid',
      String(sandboxUid),
      '--gid',
      String(sandboxUid),
      '--tl-sec',
      String(cpuLimitS),
      '--ml-bytes',
      '1073741824', // 1 GB memory limit for compiler
      '--fsize-bytes',
      '52428800', // 50 MB binary size limit
      '--nproc',
      '50',
      '--seccomp',
      '--',
      '/usr/bin/g++',
      ...extraFlags,
      ...sourceFiles,
      '-o',
      binPath,
    ];
  } else {
    cmd = 'g++';
    args = [...extraFlags, ...sourceFiles, '-o', binPath];
  }

  const stderrChunks: Buffer[] = [];
  let stderrRetained = 0;
  const MAX_STDERR_RETAINED = 64 * 1024; // 64 KB

  const child = spawn(cmd, args, {
    cwd: runDir,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Child might already have exited
    }
  }, timeoutMs);

  child.stderr?.on('data', (chunk: Buffer) => {
    if (stderrRetained < MAX_STDERR_RETAINED) {
      const take = Math.min(chunk.length, MAX_STDERR_RETAINED - stderrRetained);
      stderrChunks.push(chunk.subarray(0, take));
      stderrRetained += take;
    }
  });

  const execRes = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      let settled = false;

      const hardTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            if (child.pid) process.kill(-child.pid, 'SIGKILL');
          } catch {
            // Ignore
          }
          resolve({ code: -1, signal: 'SIGKILL' });
        }
      }, timeoutMs + 1000);

      child.on('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          clearTimeout(hardTimer);
          resolve({ code: 1, signal: null });
        }
      });

      child.on('close', (code, signal) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          clearTimeout(hardTimer);
          resolve({ code, signal });
        }
      });
    }
  );

  const wallTimeMs = Math.round(performance.now() - compileStart);
  const rawStderr = Buffer.concat(stderrChunks).toString('utf-8');
  let sanitizedOutput = sanitizeCompileMessage(rawStderr, secretToScrub, runDir);

  const isTimeout =
    timedOut ||
    execRes.signal === 'SIGXCPU' ||
    (execRes.signal === 'SIGKILL' && wallTimeMs >= timeoutMs - 150);

  if (isTimeout) {
    sanitizedOutput = 'Biên dịch quá thời gian';
  }

  const success = !isTimeout && execRes.code === 0 && fs.existsSync(binPath);

  return {
    success,
    code: execRes.code,
    signal: execRes.signal,
    output: sanitizedOutput,
    wallTimeMs,
  };
}
