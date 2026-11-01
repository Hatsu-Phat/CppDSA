import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compileCpp, sanitizeCompileMessage } from '../src/compiler.js';
import { runTest } from '../src/runner.js';

describe('Grader Hardening & Resource Limiting Tests', () => {
  it('compile timeout returns friendly error message without leaking paths', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-compile-timeout-'));
    const srcFile = path.join(tmpDir, 'timeout.cpp');
    const binFile = path.join(tmpDir, 'out_bin');

    fs.writeFileSync(srcFile, '#include <iostream>\nint main() { return 0; }');

    // Very short timeout (1ms) to trigger compile timeout
    const res = await compileCpp(tmpDir, [srcFile], binFile, {
      sandboxUid: 0,
      launcherPath: '/nonexistent/launcher',
      timeoutMs: 1,
    });

    expect(res.success).toBe(false);
    expect(res.output).toContain('Biên dịch quá thời gian');
    expect(res.output).not.toContain(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('compile output redacts sensitive file includes and tokens', () => {
    const leakedRaw = `/etc/passwd:1:1: error: 'root' does not name a type\nroot:x:0:0:root:/root:/bin/bash\n/tmp/run_123/template.cpp: In function 'int solve(int, int)':`;
    const sanitized = sanitizeCompileMessage(leakedRaw, 'my-super-secret', '/tmp/run_123');

    expect(sanitized).toBe('Không được include file ngoài bài nộp');
    expect(sanitized).not.toContain('root:x');
    expect(sanitized).not.toContain('does not name a type');
    expect(sanitized).not.toContain('/etc/passwd');
  });

  it('compiler blocks #include of absolute or sensitive paths before compilation', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-compile-block-'));
    const srcFile = path.join(tmpDir, 'hack.cpp');
    const binFile = path.join(tmpDir, 'out_bin');

    fs.writeFileSync(
      srcFile,
      '#include "/etc/passwd"\n#include "/proc/self/environ"\nint main(){return 0;}'
    );

    const res = await compileCpp(tmpDir, [srcFile], binFile, {
      sandboxUid: 0,
      launcherPath: '/nonexistent/launcher',
      timeoutMs: 10000,
    });

    expect(res.success).toBe(false);
    expect(res.output).toBe('Không được include file ngoài bài nộp');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('PCH directory is read-only and cannot be written to by non-root', () => {
    const pchDir = '/usr/local/include/cppdsa_pch';
    if (fs.existsSync(pchDir)) {
      const stats = fs.statSync(pchDir);
      expect(stats.uid).toBe(0);
      const isOthersWritable = (stats.mode & 0o002) !== 0;
      expect(isOthersWritable).toBe(false);
    }
  });

  it('runner verdict is TLE when wall deadline is exceeded (catching sleep)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-sleep-'));
    const srcFile = path.join(tmpDir, 'sleep.cpp');
    const binFile = path.join(tmpDir, 'sleep_bin');

    fs.writeFileSync(srcFile, '#include <unistd.h>\nint main() { sleep(5); return 0; }\n');

    const compileRes = await compileCpp(tmpDir, [srcFile], binFile, {
      sandboxUid: 0,
      launcherPath: '/nonexistent/launcher',
      timeoutMs: 10000,
    });

    if (compileRes.success && fs.existsSync(binFile)) {
      const runRes = await runTest(tmpDir, binFile, '', '', {
        sandboxUid: 0,
        launcherPath: '/nonexistent/launcher',
        timeLimitMs: 200,
        memoryLimitMb: 128,
        graderWallFactor: 2, // wall deadline = 200 * 2 + 1000 = 1400ms
      });

      expect(runRes.verdict).toBe('TLE');
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runner verdict is TLE when CPU time in rusage exceeds timeLimitMs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-cputle-'));
    const fakeBin = path.join(tmpDir, 'fake_bin');
    // Create a dummy executable script that creates rusage.json
    fs.writeFileSync(fakeBin, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakeBin, 0o755);

    // Pre-create rusage.json indicating 1250ms CPU time
    fs.writeFileSync(
      path.join(tmpDir, 'rusage.json'),
      JSON.stringify({
        maxrss_kb: 4096,
        exit_code: 0,
        signal: 0,
        user_time_ms: 1100,
        sys_time_ms: 150,
      })
    );

    const runRes = await runTest(tmpDir, fakeBin, '', '', {
      sandboxUid: 0,
      launcherPath: fakeBin, // exists
      timeLimitMs: 1000, // TL is 1000ms < 1250ms
      memoryLimitMb: 128,
      graderWallFactor: 10,
    });

    expect(runRes.verdict).toBe('TLE');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runner verdict is AC and timeMs is CPU time when CPU 800ms is within TL 1000ms', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-cpuac-'));
    const fakeBin = path.join(tmpDir, 'fake_bin');
    // Output 'OK' to match expected
    fs.writeFileSync(fakeBin, '#!/bin/sh\necho "OK"\nexit 0\n');
    fs.chmodSync(fakeBin, 0o755);

    // Write rusage.json with 800ms CPU time
    fs.writeFileSync(
      path.join(tmpDir, 'rusage.json'),
      JSON.stringify({
        maxrss_kb: 4096,
        exit_code: 0,
        signal: 0,
        user_time_ms: 720,
        sys_time_ms: 80,
      })
    );

    const runRes = await runTest(tmpDir, fakeBin, '', 'OK', {
      sandboxUid: 0,
      launcherPath: fakeBin,
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      graderWallFactor: 10,
    });

    expect(runRes.verdict).toBe('AC');
    expect(runRes.timeMs).toBe(800); // exactly user + sys time

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
