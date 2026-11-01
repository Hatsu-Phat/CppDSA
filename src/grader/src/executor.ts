import fs from 'node:fs';
import path from 'node:path';
import {
  JudgeJob,
  JudgeResult,
  TestResult,
  JudgeVerdict,
  stitchTemplate,
  generateFreeModeCode,
} from '@cppdsa/shared';
import { UidPool } from './uid-pool.js';
import { GraderConfig } from './config.js';
import { compileCpp } from './compiler.js';
import { runTest } from './runner.js';

export async function executeJob(
  job: JudgeJob,
  uidPool: UidPool,
  config: GraderConfig
): Promise<JudgeResult> {
  const sandboxUid = await uidPool.acquire();
  const runDir = `/tmp/run_${job.submissionId}_${Date.now()}`;

  try {
    // 0. Ensure system temporary directories are not world-writable
    try {
      fs.chmodSync('/dev/shm', 0o755);
      fs.chmodSync('/tmp', 0o755);
      fs.chmodSync('/var/tmp', 0o755);
    } catch {
      // Ignore
    }

    // 1. Prepare run directory
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
    fs.mkdirSync(runDir, { recursive: true });
    try {
      fs.chmodSync(runDir, 0o700);
      fs.chownSync(runDir, sandboxUid, sandboxUid);
    } catch {
      // In non-root or non-Linux dev environments
    }

    const binPath = path.join(runDir, 'solution_bin');
    const sourceFiles: string[] = [];

    // 2. Prepare source code
    if (job.mode === 'template') {
      if (!job.template) {
        throw new Error('Template specification missing for template mode');
      }
      const stitchRes = stitchTemplate(job.template.source, job.template.regions);
      if (!stitchRes.success || !stitchRes.code) {
        throw new Error(stitchRes.error || 'Failed to stitch template');
      }
      const stitchedPath = path.join(runDir, 'template.cpp');
      fs.writeFileSync(stitchedPath, stitchRes.code, 'utf-8');
      try {
        fs.chownSync(stitchedPath, sandboxUid, sandboxUid);
        fs.chmodSync(stitchedPath, 0o644);
      } catch {
        // Ignore
      }
      sourceFiles.push(stitchedPath);
    } else if (job.mode === 'free') {
      if (!job.free) {
        throw new Error('Free mode specification missing for free mode');
      }
      const genRes = generateFreeModeCode(job.free);
      if (!genRes.success || !genRes.code) {
        throw new Error(genRes.error || 'Failed to generate free mode code');
      }
      const adapterPath = path.join(runDir, 'adapter.cpp');
      fs.writeFileSync(adapterPath, genRes.code, 'utf-8');
      try {
        fs.chownSync(adapterPath, sandboxUid, sandboxUid);
        fs.chmodSync(adapterPath, 0o644);
      } catch {
        // Ignore
      }
      sourceFiles.push(adapterPath);
    } else {
      throw new Error(`Unsupported mode: ${(job as any).mode}`);
    }

    // 3. Compile in sandbox
    const compileRes = await compileCpp(runDir, sourceFiles, binPath, {
      sandboxUid,
      launcherPath: config.launcherPath,
      timeoutMs: config.compileTimeoutMs,
      secretToScrub: config.graderSecret,
    });

    if (!compileRes.success) {
      return {
        submissionId: job.submissionId,
        status: 'DONE',
        verdict: 'CE',
        score: 0,
        tests: [],
        compileMessage: compileRes.output,
      };
    }

    try {
      fs.chownSync(binPath, sandboxUid, sandboxUid);
      fs.chmodSync(binPath, 0o755);
    } catch {
      // Ignore
    }

    // 4. Run Hidden Tests
    const testResults: TestResult[] = [];
    let passedCount = 0;
    const totalTests = job.hiddenTests.length;

    for (let i = 0; i < totalTests; i++) {
      const hiddenTest = job.hiddenTests[i];
      const testRes = await runTest(runDir, binPath, hiddenTest.input, hiddenTest.expected, {
        sandboxUid,
        launcherPath: config.launcherPath,
        timeLimitMs: job.timeLimitMs,
        memoryLimitMb: job.memoryLimitMb,
        maxOutputBytes: config.maxOutputBytes,
      });

      if (testRes.verdict === 'AC') {
        passedCount++;
      }

      testResults.push({
        index: i,
        verdict: testRes.verdict,
        timeMs: testRes.timeMs,
        memoryKb: testRes.memoryKb,
      });

      // Quick sweep of orphan processes after each test
      uidPool.killProcessesByUid(sandboxUid);
    }

    // 5. Determine Overall Verdict and Score
    let overallVerdict: JudgeVerdict = 'AC';
    if (passedCount === totalTests) {
      overallVerdict = 'AC';
    } else {
      const firstFailed = testResults.find((t) => t.verdict !== 'AC');
      overallVerdict = firstFailed ? firstFailed.verdict : 'WA';
    }

    const rawScore = totalTests > 0 ? passedCount / totalTests : 0;
    const score = Number(rawScore.toFixed(4));

    return {
      submissionId: job.submissionId,
      status: 'DONE',
      verdict: overallVerdict,
      score,
      tests: testResults,
    };
  } catch (err: any) {
    return {
      submissionId: job.submissionId,
      status: 'SYSTEM_ERROR',
      verdict: 'SE',
      score: 0,
      tests: [],
      compileMessage: `System error during execution: ${err.message || 'Unknown error'}`,
    };
  } finally {
    // Clean up run directory and release UID
    try {
      if (fs.existsSync(runDir)) {
        fs.rmSync(runDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
    uidPool.release(sandboxUid);
  }
}
