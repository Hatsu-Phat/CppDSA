import { buildGraderApp } from '../../src/grader/dist/app.js';

export async function runUidBaseTest(options) {
  const { callbackBaseUrl, registerCallbackWaiter } = options;
  const customPort = 4165;
  const secret = 'uid-base-secret-123';
  const customBase = 1500000000;
  const submissionId = `sub-uid-base-${Date.now()}`;

  const customApp = buildGraderApp({
    port: customPort,
    host: '127.0.0.1',
    graderSecret: secret,
    concurrency: 1,
    sandboxUidBase: customBase,
    sandboxUidCount: 4,
  });

  await customApp.listen({ port: customPort, host: '127.0.0.1' });

  const waiter = registerCallbackWaiter(submissionId, 25000);

  const job = {
    submissionId,
    mode: 'template',
    language: 'cpp17',
    timeLimitMs: 1500,
    memoryLimitMb: 128,
    compare: 'trim-trailing',
    template: {
      source: `
#include <iostream>
#include <unistd.h>
// STUDENT_BEGIN solve
int solve();
// STUDENT_END
int main() {
    std::cout << solve() << std::endl;
    return 0;
}
`,
      regions: {
        solve: `int solve() {
          uid_t u = getuid();
          if (u >= 1500000000 && u < 1500000004) {
              return 1;
          }
          return 0;
        }`,
      },
    },
    hiddenTests: [{ id: '1', input: '', expected: '1' }],
    callbackUrl: `${callbackBaseUrl}/callback/${submissionId}`,
  };

  try {
    const res = await fetch(`http://127.0.0.1:${customPort}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Grader-Secret': secret,
      },
      body: JSON.stringify(job),
    });

    if (res.status !== 202) {
      await customApp.close();
      return { pass: false, details: `Job submission rejected with status ${res.status}` };
    }

    const result = await waiter;
    await customApp.close();

    if (!result) {
      return { pass: false, details: 'Timeout waiting for callback' };
    }

    if (result.verdict !== 'AC') {
      return {
        pass: false,
        details: `Expected AC with uid in range [1500000000, 1500000004), got verdict ${result.verdict}`,
      };
    }

    return {
      pass: true,
      details: `AC achieved with process UID verified in custom range [${customBase}, ${customBase + 4})`,
    };
  } catch (err) {
    await customApp.close();
    return { pass: false, details: `Error: ${err.message}` };
  }
}
