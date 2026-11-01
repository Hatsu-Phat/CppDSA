import { performance } from 'node:perf_hooks';
import { buildGraderApp } from '../../src/grader/dist/app.js';

export async function runMemoryBudgetTest(options) {
  const { callbackBaseUrl, registerCallbackWaiter } = options;
  const budgetPort = 4175;
  const secret = 'budget-test-secret-789';
  const budgetApp = buildGraderApp({
    port: budgetPort,
    host: '127.0.0.1',
    graderSecret: secret,
    concurrency: 2,
    memoryBudgetMb: 400,
  });

  await budgetApp.listen({ port: budgetPort, host: '127.0.0.1' });

  const sleepTemplate = `
#include <iostream>
#include <unistd.h>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() {
    solve();
    std::cout << "DONE" << std::endl;
    return 0;
}
`;

  try {
    // 1. Two jobs with ML 256 under budget 400 -> must run SEQUENTIALLY
    const id256_1 = `sub-budget-256-1-${Date.now()}`;
    const id256_2 = `sub-budget-256-2-${Date.now()}`;

    const job256_1 = {
      submissionId: id256_1,
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 2500,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: sleepTemplate,
        regions: { solve: 'void solve() { usleep(500000); }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'DONE' }],
      callbackUrl: `${callbackBaseUrl}/callback/${id256_1}`,
    };

    const job256_2 = {
      ...job256_1,
      submissionId: id256_2,
      callbackUrl: `${callbackBaseUrl}/callback/${id256_2}`,
    };

    let finish256_1 = 0;
    let finish256_2 = 0;

    const waiter256_1 = registerCallbackWaiter(id256_1, 20000).then((res) => {
      finish256_1 = performance.now();
      return res;
    });
    const waiter256_2 = registerCallbackWaiter(id256_2, 20000).then((res) => {
      finish256_2 = performance.now();
      return res;
    });

    // Send both simultaneously
    await Promise.all([
      fetch(`http://127.0.0.1:${budgetPort}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Grader-Secret': secret },
        body: JSON.stringify(job256_1),
      }),
      fetch(`http://127.0.0.1:${budgetPort}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Grader-Secret': secret },
        body: JSON.stringify(job256_2),
      }),
    ]);

    const [res256_1, res256_2] = await Promise.all([waiter256_1, waiter256_2]);
    if (!res256_1 || !res256_2 || res256_1.verdict !== 'AC' || res256_2.verdict !== 'AC') {
      await budgetApp.close();
      return { pass: false, details: 'Jobs with ML 256 failed to get AC' };
    }

    const gap256 = Math.abs(finish256_2 - finish256_1);
    if (gap256 < 400) {
      await budgetApp.close();
      return {
        pass: false,
        details: `Jobs with ML 256 did not run sequentially! Gap between finishes was only ${Math.round(gap256)}ms`,
      };
    }

    // 2. Two jobs with ML 64 under budget 400 -> must run IN PARALLEL (concurrency 2)
    const id64_1 = `sub-budget-64-1-${Date.now()}`;
    const id64_2 = `sub-budget-64-2-${Date.now()}`;

    const job64_1 = {
      submissionId: id64_1,
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 2500,
      memoryLimitMb: 64,
      compare: 'trim-trailing',
      template: {
        source: sleepTemplate,
        regions: { solve: 'void solve() { usleep(500000); }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'DONE' }],
      callbackUrl: `${callbackBaseUrl}/callback/${id64_1}`,
    };

    const job64_2 = {
      ...job64_1,
      submissionId: id64_2,
      callbackUrl: `${callbackBaseUrl}/callback/${id64_2}`,
    };

    let finish64_1 = 0;
    let finish64_2 = 0;

    const waiter64_1 = registerCallbackWaiter(id64_1, 20000).then((res) => {
      finish64_1 = performance.now();
      return res;
    });
    const waiter64_2 = registerCallbackWaiter(id64_2, 20000).then((res) => {
      finish64_2 = performance.now();
      return res;
    });

    await Promise.all([
      fetch(`http://127.0.0.1:${budgetPort}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Grader-Secret': secret },
        body: JSON.stringify(job64_1),
      }),
      fetch(`http://127.0.0.1:${budgetPort}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Grader-Secret': secret },
        body: JSON.stringify(job64_2),
      }),
    ]);

    const [res64_1, res64_2] = await Promise.all([waiter64_1, waiter64_2]);
    await budgetApp.close();

    if (!res64_1 || !res64_2 || res64_1.verdict !== 'AC' || res64_2.verdict !== 'AC') {
      return { pass: false, details: 'Jobs with ML 64 failed to get AC' };
    }

    const gap64 = Math.abs(finish64_2 - finish64_1);
    if (gap64 > 250) {
      return {
        pass: false,
        details: `Jobs with ML 64 did not run in parallel! Gap between finishes was ${Math.round(gap64)}ms`,
      };
    }

    return {
      pass: true,
      details: `ML 256 sequential (gap ${Math.round(gap256)}ms >= 400ms), ML 64 parallel (gap ${Math.round(gap64)}ms <= 250ms)`,
    };
  } catch (err) {
    await budgetApp.close();
    return { pass: false, details: `Memory budget test error: ${err.message}` };
  }
}
