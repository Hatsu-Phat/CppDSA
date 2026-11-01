import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { normalizeOutput, JudgeVerdict } from '@cppdsa/shared';

export interface RunTestOptions {
  sandboxUid: number;
  launcherPath: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  maxOutputBytes?: number;
}

export interface RunTestResult {
  verdict: JudgeVerdict;
  timeMs: number;
  memoryKb: number;
}

export async function runTest(
  runDir: string,
  binPath: string,
  inputData: string,
  expectedOutput: string,
  options: RunTestOptions
): Promise<RunTestResult> {
  const { sandboxUid, launcherPath, timeLimitMs, memoryLimitMb } = options;
  const maxOutputBytes = options.maxOutputBytes || 256 * 1024;
  const memoryLimitBytes = memoryLimitMb * 1024 * 1024;
  const tlSec = Math.ceil(timeLimitMs / 1000);

  const useLauncher = fs.existsSync(launcherPath);
  let cmd: string;
  let args: string[];

  if (useLauncher) {
    cmd = launcherPath;
    args = [
      '--workdir',
      runDir,
      '--uid',
      String(sandboxUid),
      '--gid',
      String(sandboxUid),
      '--tl-sec',
      String(tlSec),
      '--ml-bytes',
      String(memoryLimitBytes),
      '--fsize-bytes',
      '10485760', // 10 MB
      '--nproc',
      '20',
      '--seccomp',
      '--',
      binPath,
    ];
  } else {
    cmd = binPath;
    args = [];
  }

  const runStart = performance.now();
  let timedOut = false;
  let oleTriggered = false;
  let stdoutBytes = 0;
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stderrRetained = 0;
  const MAX_STDERR_RETAINED = 64 * 1024;

  const child = spawn(cmd, args, {
    cwd: runDir,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let killFallbackTimer: NodeJS.Timeout | null = null;
  let oleFallbackTimer: NodeJS.Timeout | null = null;

  // Soft timeout timer: signals child
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Ignore
    }
    killFallbackTimer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Ignore
      }
    }, 100);
  }, timeLimitMs + 50);

  // Send input to stdin
  child.stdin?.on('error', () => {});
  if (inputData && child.stdin) {
    child.stdin.write(inputData);
  }
  child.stdin?.end();

  // Capture stdout with size limit
  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > maxOutputBytes) {
      oleTriggered = true;
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Ignore
      }
      oleFallbackTimer = setTimeout(() => {
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          // Ignore
        }
      }, 50);
    } else {
      stdoutChunks.push(chunk);
    }
  });

  // Capture stderr with size limit
  child.stderr?.on('data', (chunk: Buffer) => {
    if (stderrRetained < MAX_STDERR_RETAINED) {
      const take = Math.min(chunk.length, MAX_STDERR_RETAINED - stderrRetained);
      stderrChunks.push(chunk.subarray(0, take));
      stderrRetained += take;
    }
  });

  const execRes = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    wallTimeMs: number;
  }>((resolve) => {
    let settled = false;

    // Hard wall-clock deadline
    const hardDeadlineTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (killFallbackTimer) clearTimeout(killFallbackTimer);
        if (oleFallbackTimer) clearTimeout(oleFallbackTimer);
        try {
          child.stdout?.destroy();
          child.stderr?.destroy();
          child.stdin?.destroy();
        } catch {
          // Ignore
        }
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          // Ignore
        }
        const wallTime = Math.round(performance.now() - runStart);
        resolve({ code: -1, signal: 'SIGKILL', wallTimeMs: wallTime });
      }
    }, timeLimitMs + 400);

    child.on('close', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        clearTimeout(hardDeadlineTimer);
        if (killFallbackTimer) clearTimeout(killFallbackTimer);
        if (oleFallbackTimer) clearTimeout(oleFallbackTimer);
        const wallTime = Math.round(performance.now() - runStart);
        resolve({ code, signal, wallTimeMs: wallTime });
      }
    });
  });

  const wallTimeMs = execRes.wallTimeMs;
  const stdoutRaw = Buffer.concat(stdoutChunks).toString('utf-8');
  const stderrRaw = Buffer.concat(stderrChunks).toString('utf-8');

  // Read rusage.json if written by launcher
  let memoryKb = 0;
  const rusagePath = path.join(runDir, 'rusage.json');
  if (fs.existsSync(rusagePath)) {
    try {
      const rusage = JSON.parse(fs.readFileSync(rusagePath, 'utf-8'));
      memoryKb = rusage.maxrss_kb || 0;
    } catch {
      // Ignore
    }
  }

  // Determine Verdict
  let verdict: JudgeVerdict = 'RE';

  if (oleTriggered || execRes.signal === 'SIGXFSZ') {
    verdict = 'RE'; // Or OLE mapped to RE
  } else if (timedOut || execRes.signal === 'SIGXCPU' || wallTimeMs > timeLimitMs + 50) {
    verdict = 'TLE';
  } else if (
    stderrRaw.includes('bad_alloc') ||
    stderrRaw.includes('std::bad_alloc') ||
    stderrRaw.includes('Out of memory') ||
    (memoryLimitMb > 0 && memoryKb > memoryLimitMb * 1024)
  ) {
    verdict = 'MLE';
  } else if (execRes.code !== 0 || execRes.signal !== null) {
    verdict = 'RE';
  } else {
    // Normal termination with exit code 0
    const normActual = normalizeOutput(stdoutRaw);
    const normExpected = normalizeOutput(expectedOutput);
    if (normActual === normExpected) {
      verdict = 'AC';
    } else {
      verdict = 'WA';
    }
  }

  return {
    verdict,
    timeMs: wallTimeMs,
    memoryKb,
  };
}
