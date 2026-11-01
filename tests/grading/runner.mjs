import http from 'node:http';
import { testCases } from './cases.mjs';
import { runConcurrencyTest } from './concurrency.mjs';
import { runCrashRecoveryTest } from './recovery.mjs';
import { runLeakCheckTest } from './leak-check.mjs';
import { runUidBaseTest } from './uid-base.mjs';
import { runMemoryBudgetTest } from './mem-budget.mjs';
import { buildGraderApp } from '../../src/grader/dist/app.js';

const GRADER_PORT = 4150;
const CALLBACK_PORT = 4151;
const GRADER_SECRET = 'grading-suite-secret-token-xyz';
const GRADER_URL = `http://127.0.0.1:${GRADER_PORT}`;
const CALLBACK_BASE_URL = `http://127.0.0.1:${CALLBACK_PORT}`;

// ==========================================
// 1. Mock Callback Receiver Server
// ==========================================
const callbackWaiters = new Map();

function registerCallbackWaiter(submissionId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      callbackWaiters.delete(submissionId);
      resolve(null);
    }, timeoutMs);

    callbackWaiters.set(submissionId, (body) => {
      clearTimeout(timer);
      callbackWaiters.delete(submissionId);
      resolve(body);
    });
  });
}

const callbackServer = http.createServer((req, res) => {
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      try {
        const json = JSON.parse(rawBody);
        const subId = json.submissionId;
        const waiter = callbackWaiters.get(subId);
        if (waiter) {
          waiter(json);
        }
      } catch {
        // Ignore
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

async function main() {
  console.log('================================================================');
  console.log('   CppDSA Grader Test Suite (T-0006 Verification)              ');
  console.log('================================================================');

  // Start callback server
  await new Promise((resolve) => callbackServer.listen(CALLBACK_PORT, '127.0.0.1', resolve));

  // Start main grader application
  const graderApp = buildGraderApp({
    port: GRADER_PORT,
    host: '127.0.0.1',
    graderSecret: GRADER_SECRET,
    concurrency: 2,
  });
  await graderApp.listen({ port: GRADER_PORT, host: '127.0.0.1' });

  const tableRows = [];
  let allPassed = true;

  // 2. Run Standard Test Cases
  for (const tc of testCases) {
    const submissionId = `sub-${tc.id.toLowerCase()}-${Date.now()}`;
    let pass = false;
    let actualVerdict = 'SE';
    let actualScore = 0;
    let expectedVerdictStr = '';

    if (tc.mode === 'http-validation') {
      expectedVerdictStr = `HTTP ${tc.expected.statusCode}`;
      try {
        const res = await fetch(`${GRADER_URL}/jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Grader-Secret': GRADER_SECRET,
          },
          body: JSON.stringify({
            submissionId,
            callbackUrl: `${CALLBACK_BASE_URL}/callback/${submissionId}`,
            ...tc.job,
          }),
        });

        actualVerdict = `HTTP ${res.status}`;
        actualScore = '-';
        pass = res.status === tc.expected.statusCode;
      } catch (err) {
        actualVerdict = `ERR: ${err.message}`;
        pass = false;
      }
    } else {
      const allowedVerdicts = Array.isArray(tc.expected.verdict)
        ? tc.expected.verdict
        : [tc.expected.verdict];
      expectedVerdictStr = allowedVerdicts.join('/');

      const waiter = registerCallbackWaiter(submissionId, 25000);

      try {
        const submitRes = await fetch(`${GRADER_URL}/jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Grader-Secret': GRADER_SECRET,
          },
          body: JSON.stringify({
            submissionId,
            callbackUrl: `${CALLBACK_BASE_URL}/callback/${submissionId}`,
            ...tc.job,
          }),
        });

        if (submitRes.status !== 202) {
          actualVerdict = `HTTP ${submitRes.status}`;
          pass = false;
        } else {
          const result = await waiter;
          if (!result) {
            actualVerdict = 'TIMEOUT';
            pass = false;
          } else {
            actualVerdict = result.verdict;
            actualScore = result.score;

            const verdictMatch = allowedVerdicts.includes(result.verdict);
            let scoreMatch = true;
            if (tc.expected.score !== undefined) {
              scoreMatch = Math.abs(Number(result.score) - Number(tc.expected.score)) < 0.01;
            }
            let lengthMatch = true;
            if (tc.expected.maxCompileMessageLength !== undefined) {
              lengthMatch =
                typeof result.compileMessage === 'string' &&
                result.compileMessage.length <= tc.expected.maxCompileMessageLength;
            }

            pass = verdictMatch && scoreMatch && lengthMatch;
          }
        }
      } catch (err) {
        actualVerdict = `ERR: ${err.message}`;
        pass = false;
      }
    }

    if (!pass) allPassed = false;

    tableRows.push({
      ca: tc.id,
      mode: tc.mode,
      kyVong: expectedVerdictStr,
      thucTe: actualVerdict,
      diem: typeof actualScore === 'number' ? actualScore.toFixed(2) : String(actualScore),
      ketQua: pass ? 'PASS' : 'FAIL',
    });
  }

  // 3. Concurrency Test (20 jobs simultaneous)
  console.log('Running 20 concurrent jobs test...');
  const concRes = await runConcurrencyTest({
    graderUrl: GRADER_URL,
    graderSecret: GRADER_SECRET,
    callbackBaseUrl: CALLBACK_BASE_URL,
    registerCallbackWaiter,
  });
  if (!concRes.pass) allPassed = false;
  tableRows.push({
    ca: 'TC-CONC-20',
    mode: 'concurrency',
    kyVong: '20x AC',
    thucTe: concRes.pass ? '20x AC' : 'FAIL',
    diem: '1.00',
    ketQua: concRes.pass ? 'PASS' : 'FAIL',
  });

  // 4. Crash Recovery Test
  console.log('Running crash recovery test...');
  const recRes = await runCrashRecoveryTest({
    callbackBaseUrl: CALLBACK_BASE_URL,
    registerCallbackWaiter,
  });
  if (!recRes.pass) {
    allPassed = false;
    console.error('Recovery test failure:', recRes.details);
  } else {
    console.log('Recovery test:', recRes.details);
  }
  tableRows.push({
    ca: 'TC-RECOVERY',
    mode: 'recovery',
    kyVong: 'RETRY -> AC',
    thucTe: recRes.pass ? 'RETRY -> AC' : 'FAIL',
    diem: '1.00',
    ketQua: recRes.pass ? 'PASS' : 'FAIL',
  });

  // 5. Leak Check Test
  console.log('Running leak check test...');
  const leakRes = await runLeakCheckTest({
    graderUrl: GRADER_URL,
    graderSecret: GRADER_SECRET,
    callbackBaseUrl: CALLBACK_BASE_URL,
    registerCallbackWaiter,
  });
  if (!leakRes.pass) allPassed = false;
  tableRows.push({
    ca: 'TC-LEAK-CHK',
    mode: 'security',
    kyVong: '0 LEAK',
    thucTe: leakRes.pass ? '0 LEAK' : 'LEAK',
    diem: '1.00',
    ketQua: leakRes.pass ? 'PASS' : 'FAIL',
  });

  // 6. Custom Sandbox UID Base Test (1500000000)
  console.log('Running custom sandbox UID base test...');
  const uidRes = await runUidBaseTest({
    callbackBaseUrl: CALLBACK_BASE_URL,
    registerCallbackWaiter,
  });
  if (!uidRes.pass) {
    allPassed = false;
    console.error('UID base test failure:', uidRes.details);
  }
  tableRows.push({
    ca: 'TC-UID-BASE',
    mode: 'isolation',
    kyVong: 'UID in range',
    thucTe: uidRes.pass ? 'UID in range' : 'FAIL',
    diem: '1.00',
    ketQua: uidRes.pass ? 'PASS' : 'FAIL',
  });

  // 7. Memory Budget Concurrency Test (budget 400: ML 256 sequential vs ML 64 parallel)
  console.log('Running memory budget concurrency test...');
  const budgetRes = await runMemoryBudgetTest({
    callbackBaseUrl: CALLBACK_BASE_URL,
    registerCallbackWaiter,
  });
  if (!budgetRes.pass) {
    allPassed = false;
    console.error('Memory budget test failure:', budgetRes.details);
  }
  tableRows.push({
    ca: 'TC-MEM-BUDGET',
    mode: 'concurrency',
    kyVong: 'Seq+Par OK',
    thucTe: budgetRes.pass ? 'Seq+Par OK' : 'FAIL',
    diem: '1.00',
    ketQua: budgetRes.pass ? 'PASS' : 'FAIL',
  });

  // Clean up servers
  await graderApp.close();
  await new Promise((resolve) => callbackServer.close(resolve));

  // 6. Print Formatted Results Table
  console.log('\n');
  console.log('| Ca | Mode | Kỳ vọng | Thực tế | Điểm | PASS/FAIL |');
  console.log('|---|---|---|---|---|---|');
  for (const r of tableRows) {
    console.log(
      `| ${r.ca.padEnd(11)} | ${r.mode.padEnd(15)} | ${r.kyVong.padEnd(12)} | ${r.thucTe.padEnd(12)} | ${r.diem.padEnd(5)} | ${r.ketQua.padEnd(9)} |`
    );
  }

  const passedCount = tableRows.filter((r) => r.ketQua === 'PASS').length;
  const totalCount = tableRows.length;
  console.log('\n================================================================');
  console.log(`Summary: ${passedCount}/${totalCount} cases PASSED`);
  if (!allPassed) {
    console.error('FAILED: Some cases failed!');
    process.exit(1);
  } else {
    console.log('SUCCESS: All grading tests passed cleanly!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
