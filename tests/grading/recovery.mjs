import { spawn } from 'node:child_process';
import { decideRecovery } from '@cppdsa/shared';

async function waitForHealth(port, maxWaitMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // Waiting for server to bind
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export async function runCrashRecoveryTest(options) {
  const { callbackBaseUrl, registerCallbackWaiter } = options;
  const secret = 'recovery-test-secret-456';
  const port = 4199;
  const submissionId = 'sub-crash-recovery-01';

  // 1. Start grader process 1
  const grader1 = spawn(process.execPath, ['/app/src/grader/dist/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      GRADER_SECRET: secret,
      GRADER_CONCURRENCY: '1',
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });

  const healthy1 = await waitForHealth(port);
  if (!healthy1) {
    try {
      grader1.kill('SIGKILL');
    } catch {
      // Ignore
    }
    return { pass: false, details: 'Grader process 1 failed to become healthy' };
  }

  const job = {
    submissionId,
    mode: 'template',
    language: 'cpp17',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    compare: 'trim-trailing',
    template: {
      source: `
#include <iostream>
#include <unistd.h>
// STUDENT_BEGIN solve
int solve();
// STUDENT_END
int main() { std::cout << solve() << std::endl; return 0; }
`,
      regions: {
        solve: 'int solve() { usleep(800000); return 42; }',
      },
    },
    hiddenTests: [{ id: '1', input: '', expected: '42' }],
    callbackUrl: `${callbackBaseUrl}/callback/${submissionId}`,
  };

  // 2. Submit job to grader 1
  const submitRes = await fetch(`http://127.0.0.1:${port}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Grader-Secret': secret,
    },
    body: JSON.stringify(job),
  });

  if (submitRes.status !== 202) {
    try {
      grader1.kill('SIGKILL');
    } catch {
      // Ignore
    }
    return { pass: false, details: `Initial submit failed: ${submitRes.status}` };
  }

  // 3. Kill grader process 1 abruptly while job is in progress
  await new Promise((r) => setTimeout(r, 200));
  try {
    grader1.kill('SIGKILL');
  } catch {
    // Ignore
  }

  // 4. Mock API checks recovery state
  const submissionRecord = {
    id: submissionId,
    status: 'RUNNING',
    updatedAt: new Date(Date.now() - 150 * 1000), // 2.5 minutes ago
    retryCount: 0,
  };

  const now = new Date();
  const decision = decideRecovery(submissionRecord, now);

  if (decision.action !== 'RETRY' || decision.retryCount !== 1) {
    return {
      pass: false,
      details: `decideRecovery did not return RETRY with count 1: ${JSON.stringify(decision)}`,
    };
  }

  submissionRecord.retryCount = decision.retryCount;
  submissionRecord.status = 'PENDING';
  submissionRecord.updatedAt = now;

  // 5. Start replacement grader process 2
  const grader2 = spawn(process.execPath, ['/app/src/grader/dist/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      GRADER_SECRET: secret,
      GRADER_CONCURRENCY: '1',
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });

  const healthy2 = await waitForHealth(port);
  if (!healthy2) {
    try {
      grader2.kill('SIGKILL');
    } catch {
      // Ignore
    }
    return { pass: false, details: 'Grader process 2 failed to become healthy' };
  }

  // 6. Register fresh callback waiter for resubmission
  const resubmitWaiter = registerCallbackWaiter(submissionId, 25000);

  // 7. Resubmit job to grader 2
  const resubmitRes = await fetch(`http://127.0.0.1:${port}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Grader-Secret': secret,
    },
    body: JSON.stringify(job),
  });

  if (resubmitRes.status !== 202) {
    try {
      grader2.kill('SIGKILL');
    } catch {
      // Ignore
    }
    return { pass: false, details: `Resubmit failed: ${resubmitRes.status}` };
  }

  // 8. Wait for callback from grader 2
  const finalResult = await resubmitWaiter;
  try {
    grader2.kill('SIGKILL');
  } catch {
    // Ignore
  }

  if (!finalResult) {
    return { pass: false, details: 'Timeout waiting for callback after grader restart' };
  }

  if (finalResult.submissionId !== submissionId) {
    return {
      pass: false,
      details: `SubmissionId mismatch: expected ${submissionId}, got ${finalResult.submissionId}`,
    };
  }

  if (finalResult.verdict !== 'AC') {
    return {
      pass: false,
      details: `Expected AC on resubmit but got ${finalResult.verdict}`,
    };
  }

  // 9. Verify that after 2 retries, decideRecovery returns MARK_SYSTEM_ERROR
  const exhaustedRecord = {
    id: 'sub-exhausted',
    status: 'RUNNING',
    updatedAt: new Date(Date.now() - 150 * 1000),
    retryCount: 2,
  };
  const exhaustedDecision = decideRecovery(exhaustedRecord, new Date());
  if (exhaustedDecision.action !== 'MARK_SYSTEM_ERROR') {
    return {
      pass: false,
      details: 'decideRecovery did not return MARK_SYSTEM_ERROR after 2 retries',
    };
  }

  return {
    pass: true,
    details:
      'Grader crash recovery succeeded: job resubmitted after recovery and completed with AC',
  };
}
