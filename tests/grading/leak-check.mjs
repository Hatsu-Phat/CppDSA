export async function runLeakCheckTest(options) {
  const { graderUrl, graderSecret, callbackBaseUrl, registerCallbackWaiter } = options;

  const CANARY_INPUT = 'CANARY_INPUT_SECRET_888999111';
  const CANARY_EXPECTED = 'CANARY_EXPECTED_SECRET_222333444';
  const submissionId = 'sub-leak-check-01';

  const waiterPromise = registerCallbackWaiter(submissionId, 15000);

  const job = {
    submissionId,
    mode: 'template',
    language: 'cpp17',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    compare: 'trim-trailing',
    template: {
      source: `
#include <iostream>
#include <string>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
      regions: {
        solve: `void solve() {
          std::string s;
          if (std::cin >> s) {
              std::cout << "STUDENT_ACTUAL_OUTPUT_VALUE";
          }
        }`,
      },
    },
    hiddenTests: [{ id: 'canary-1', input: CANARY_INPUT, expected: CANARY_EXPECTED }],
    callbackUrl: `${callbackBaseUrl}/callback/${submissionId}`,
  };

  // 1. Send job and inspect response body
  const res = await fetch(`${graderUrl}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Grader-Secret': graderSecret,
    },
    body: JSON.stringify(job),
  });

  const responseText = await res.text();
  if (responseText.includes(CANARY_INPUT) || responseText.includes(CANARY_EXPECTED)) {
    return {
      pass: false,
      details: 'Hidden test canary leaked in HTTP 202 response body!',
    };
  }

  // 2. Wait for callback and inspect entire callback body
  const callbackResult = await waiterPromise;
  if (!callbackResult) {
    return { pass: false, details: 'Did not receive callback for leak test' };
  }

  const callbackJson = JSON.stringify(callbackResult);

  if (callbackJson.includes(CANARY_INPUT)) {
    return {
      pass: false,
      details: 'Hidden test input canary leaked in callback body!',
    };
  }

  if (callbackJson.includes(CANARY_EXPECTED)) {
    return {
      pass: false,
      details: 'Hidden test expected canary leaked in callback body!',
    };
  }

  if (callbackJson.includes('STUDENT_ACTUAL_OUTPUT_VALUE')) {
    return {
      pass: false,
      details: 'Student actual output leaked in callback body!',
    };
  }

  // Check test result schema: only index, verdict, timeMs, memoryKb allowed
  for (const t of callbackResult.tests || []) {
    const keys = Object.keys(t);
    const forbidden = ['input', 'expected', 'actual', 'output'];
    for (const f of forbidden) {
      if (keys.includes(f)) {
        return {
          pass: false,
          details: `Forbidden field '${f}' present in test result object!`,
        };
      }
    }
  }

  return {
    pass: true,
    details:
      'Zero leakage verified: canary input/expected/actual not present in response or callback',
  };
}
