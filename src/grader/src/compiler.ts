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

  // 2. Replace run directory path or tmp paths with logical names
  if (runDir) {
    message = message.split(runDir + '/').join('');
    message = message.split(runDir).join('');
  }
  // Generic cleanup of /tmp/run_* paths
  message = message.replace(/\/tmp\/run_[A-Za-z0-9_.-]+\//g, '');
  message = message.replace(/\/tmp\/run_[A-Za-z0-9_.-]+/g, '');

  // 3. Limit to at most 2000 characters
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
  options: {
    sandboxUid: number;
    launcherPath: string;
    timeoutMs: number;
    secretToScrub?: string;
  }
): Promise<CompileResult> {
  const { sandboxUid, launcherPath, timeoutMs, secretToScrub } = options;
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
      String(Math.ceil(timeoutMs / 1000)),
      '--ml-bytes',
      '1073741824', // 1 GB memory limit for compiler
      '--fsize-bytes',
      '52428800', // 50 MB binary size limit
      '--nproc',
      '50',
      '--seccomp',
      '--',
      '/usr/bin/g++',
      '-std=c++17',
      '-O2',
      ...sourceFiles,
      '-o',
      binPath,
    ];
  } else {
    cmd = 'g++';
    args = ['-std=c++17', '-O2', ...sourceFiles, '-o', binPath];
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
  const sanitizedOutput = sanitizeCompileMessage(rawStderr, secretToScrub, runDir);

  const success = execRes.code === 0 && !timedOut && fs.existsSync(binPath);

  return {
    success,
    code: execRes.code,
    signal: execRes.signal,
    output: sanitizedOutput,
    wallTimeMs,
  };
}
