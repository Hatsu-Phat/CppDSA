import { performance } from 'node:perf_hooks';

export async function runConcurrencyTest(options) {
  const { graderUrl, graderSecret, callbackBaseUrl, registerCallbackWaiter } = options;
  const JOB_COUNT = 20;
  const startTime = performance.now();

  const templateSource = `
#include <iostream>
// STUDENT_BEGIN solve
int solve(int a, int b);
// STUDENT_END
int main() {
    int a, b;
    if (std::cin >> a >> b) {
        std::cout << solve(a, b) << std::endl;
    }
    return 0;
}
`;

  const jobs = [];
  const waiterPromises = [];

  for (let i = 1; i <= JOB_COUNT; i++) {
    const submissionId = `sub-concurrent-${String(i).padStart(2, '0')}`;
    const a = i * 10;
    const b = i * 3;
    const expected = String(a + b);

    const job = {
      submissionId,
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: templateSource,
        regions: { solve: 'int solve(int a, int b) { return a + b; }' },
      },
      hiddenTests: [{ id: `test-${i}`, input: `${a} ${b}`, expected }],
      callbackUrl: `${callbackBaseUrl}/callback/${submissionId}`,
    };

    jobs.push(job);
    waiterPromises.push(registerCallbackWaiter(submissionId, 45000));
  }

  // Send all 20 jobs simultaneously over HTTP
  const sendPromises = jobs.map(async (job) => {
    const res = await fetch(`${graderUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Grader-Secret': graderSecret,
      },
      body: JSON.stringify(job),
    });
    if (res.status !== 202) {
      throw new Error(`Job ${job.submissionId} rejected with status ${res.status}`);
    }
    return res.json();
  });

  await Promise.all(sendPromises);

  // Await all 20 callbacks
  const callbackResults = await Promise.all(waiterPromises);
  const totalTimeMs = Math.round(performance.now() - startTime);

  // Validate results
  let pass = true;
  let reason = '';

  for (let i = 0; i < JOB_COUNT; i++) {
    const expectedSubId = `sub-concurrent-${String(i + 1).padStart(2, '0')}`;
    const res = callbackResults[i];

    if (!res) {
      pass = false;
      reason += `Missing callback for ${expectedSubId}; `;
      continue;
    }

    if (res.submissionId !== expectedSubId) {
      pass = false;
      reason += `Crosstalk detected: expected ${expectedSubId} but got ${res.submissionId}; `;
    }

    if (res.verdict !== 'AC') {
      pass = false;
      reason += `Job ${expectedSubId} got verdict ${res.verdict} instead of AC; `;
    }

    if (res.score !== 1) {
      pass = false;
      reason += `Job ${expectedSubId} got score ${res.score} instead of 1; `;
    }
  }

  return {
    pass,
    totalTimeMs,
    count: JOB_COUNT,
    details: pass
      ? `All ${JOB_COUNT} concurrent jobs processed correctly in ${totalTimeMs}ms`
      : reason,
  };
}
