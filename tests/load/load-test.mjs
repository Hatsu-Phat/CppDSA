import { performance } from 'node:perf_hooks';

async function resolveUrl(urls) {
  for (const u of urls) {
    try {
      const res = await fetch(`${u}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return u;
    } catch {
      // Ignore
    }
  }
  return urls[0];
}

const API_BASE = await resolveUrl(
  [
    process.env.API_BASE_URL,
    'http://api:4000',
    'http://127.0.0.1:4000',
    'http://localhost:4000',
  ].filter(Boolean)
);

const GRADER_BASE = await resolveUrl(
  [
    process.env.GRADER_URL,
    'http://grader:4100',
    'http://127.0.0.1:4100',
    'http://localhost:4100',
  ].filter(Boolean)
);

console.log(`[LoadTest] Using API: ${API_BASE}`);
console.log(`[LoadTest] Using Grader: ${GRADER_BASE}`);
const GRADER_SECRET = process.env.GRADER_SECRET || 'dev-grader-secret';

function getArg(flag, defaultValue) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return defaultValue;
}

const SCENARIO = getArg('--scenario', 'A').toUpperCase();
const DURATION_SEC = Number(getArg('--duration', '600')); // default 10m (600s)

const TEMPLATE_CODE = `#include <bits/stdc++.h>

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

const SOLUTION_AC = `int solve(int a, int b) {
    std::vector<int> v = {a, b};
    return v[0] + v[1];
}`;

const SOLUTION_WA = `int solve(int a, int b) {
    return a - b;
}`;

const SOLUTION_CE = `int solve(int a, int b) {
    syntax_error_not_declared();
    return 0;
}`;

function calcPercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function main() {
  console.log('================================================================');
  console.log(`   CppDSA Load Test Suite — Scenario ${SCENARIO}               `);
  console.log('================================================================');

  // 1. Lecturer Login
  console.log('1. Lecturer login...');
  const lecLoginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lecturer@cppdsa.local', password: 'ChangeMe123!' }),
  });
  if (!lecLoginRes.ok) {
    throw new Error(`Lecturer login failed: ${lecLoginRes.status} ${await lecLoginRes.text()}`);
  }
  const lecCookie = lecLoginRes.headers.get('set-cookie')?.split(';')[0];

  // 2. Create Classroom
  console.log('2. Creating classroom...');
  const classRes = await fetch(`${API_BASE}/api/classrooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: lecCookie },
    body: JSON.stringify({
      name: `Load Test Class ${SCENARIO} - ${Date.now()}`,
      description: `Classroom for load test scenario ${SCENARIO}`,
    }),
  });
  const classData = await classRes.json();
  const classroomId = classData.classroom.id;

  // 3. Create Assignment
  console.log('3. Creating assignment...');
  const assignRes = await fetch(`${API_BASE}/api/classrooms/${classroomId}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: lecCookie },
    body: JSON.stringify({
      title: `Load Test Assignment ${SCENARIO}`,
      description: 'Template mode assignment with bits/stdc++.h',
      mode: 'TEMPLATE',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      deadline: '2028-12-31T23:59:00Z',
      templateCode: TEMPLATE_CODE,
    }),
  });
  const assignData = await assignRes.json();
  const assignmentId = assignData.assignment.id;

  // Add hidden test case
  await fetch(`${API_BASE}/api/assignments/${assignmentId}/tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: lecCookie },
    body: JSON.stringify({
      inputData: '15 25\n',
      expectedOutput: '40\n',
      isHidden: true,
      orderIndex: 0,
    }),
  });

  // 4. Import & Setup Students
  const studentCount = SCENARIO === 'A' ? 20 : 50;
  console.log(`4. Importing ${studentCount} students...`);
  const students = [];
  const csvRows = ['student_code,full_name,email'];
  const nowTs = Date.now();
  for (let i = 0; i < studentCount; i++) {
    const code = `LOAD_${SCENARIO}_${nowTs}_${String(i).padStart(3, '0')}`;
    const email = `${code.toLowerCase()}@cppdsa.local`;
    csvRows.push(`${code},Student Load ${i},${email}`);
    students.push({ code, email });
  }

  const importRes = await fetch(`${API_BASE}/api/classrooms/${classroomId}/students/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: lecCookie },
    body: JSON.stringify({ csv: csvRows.join('\n') }),
  });
  const importData = await importRes.json();
  const created = importData.createdStudents || importData.students || [];

  console.log(`5. Authenticating ${studentCount} students...`);
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const found = created.find((c) => (c.studentCode || c.student_code) === s.code);
    s.tempPassword = (found?.temporaryPassword || found?.temporary_password || '').trim();
    s.newPassword = 'NewLoadPassword123!';

    const logRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: s.email, password: s.tempPassword }),
    });
    const cookie = logRes.headers.get('set-cookie')?.split(';')[0];
    await fetch(`${API_BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ oldPassword: s.tempPassword, newPassword: s.newPassword }),
    });
    s.cookie = cookie;
  }

  console.log(`\n================================================================`);
  console.log(`Starting Scenario ${SCENARIO} Submissions...`);
  console.log(`================================================================`);

  const submissionRecords = [];
  let firstSubmitTime = Infinity;
  let lastCompletedTime = 0;
  let http429Count = 0;
  let http5xxCount = 0;
  let otherHttpErrorCount = 0;

  if (SCENARIO === 'A') {
    // Scenario A: 20 students simultaneously submit 1 correct solution
    const promises = students.map(async (stu) => {
      const submitStart = performance.now();
      firstSubmitTime = Math.min(firstSubmitTime, Date.now());
      try {
        const subRes = await fetch(`${API_BASE}/api/assignments/${assignmentId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: stu.cookie },
          body: JSON.stringify({
            regions: { solve: SOLUTION_AC },
          }),
        });

        if (!subRes.ok) {
          if (subRes.status === 429) http429Count++;
          else if (subRes.status >= 500) http5xxCount++;
          else otherHttpErrorCount++;
          return {
            id: null,
            studentCode: stu.code,
            error: `HTTP ${subRes.status}`,
            latencyMs: 0,
            queueTimeMs: 0,
            compileTimeMs: 0,
            runTimeMs: 0,
            status: 'FAILED',
          };
        }

        const subJson = await subRes.json();
        const subId = subJson.submission.id;

        // Poll until COMPLETED or SYSTEM_ERROR
        let finished = null;
        for (let p = 0; p < 360; p++) {
          await new Promise((r) => setTimeout(r, 1000));
          const pollRes = await fetch(`${API_BASE}/api/submissions/${subId}`, {
            headers: { cookie: stu.cookie },
          });
          if (pollRes.ok) {
            const body = await pollRes.json();
            const st = body.submission?.status;
            if (st === 'COMPLETED' || st === 'SYSTEM_ERROR') {
              finished = body.submission;
              lastCompletedTime = Math.max(lastCompletedTime, Date.now());
              break;
            }
          }
        }

        const latencyMs = Math.round(performance.now() - submitStart);

        // Fetch grader metrics if available
        let queueTimeMs = 0;
        let compileTimeMs = 0;
        let runTimeMs = 0;
        try {
          const mRes = await fetch(`${GRADER_BASE}/jobs/${subId}/metrics`, {
            headers: { 'X-Grader-Secret': GRADER_SECRET },
          });
          if (mRes.ok) {
            const mData = await mRes.json();
            queueTimeMs = mData.queueMs || 0;
            compileTimeMs = mData.compileMs || 0;
            runTimeMs = mData.runMs || 0;
          }
        } catch {
          // Ignore
        }

        return {
          id: subId,
          studentCode: stu.code,
          status: finished?.status || 'LOST',
          verdict:
            finished?.tests?.[0]?.verdict || (finished?.status === 'COMPLETED' ? 'AC' : 'SE'),
          latencyMs,
          queueTimeMs,
          compileTimeMs,
          runTimeMs,
        };
      } catch (err) {
        otherHttpErrorCount++;
        return {
          id: null,
          studentCode: stu.code,
          error: err.message,
          latencyMs: 0,
          queueTimeMs: 0,
          compileTimeMs: 0,
          runTimeMs: 0,
          status: 'ERROR',
        };
      }
    });

    const results = await Promise.all(promises);
    submissionRecords.push(...results);
  } else {
    // Scenario B: 50 students, each submits 2 times randomly spread across duration (default 10 min)
    // Mixed: 60% AC, 20% WA, 20% CE
    const totalSubmissions = studentCount * 2;
    console.log(`Scheduling ${totalSubmissions} submissions across ${DURATION_SEC} seconds...`);

    const items = [];
    for (const stu of students) {
      // 2 submissions per student, spaced out
      const t1 = Math.floor(Math.random() * (DURATION_SEC * 0.45));
      const t2 = Math.floor(DURATION_SEC * 0.5 + Math.random() * (DURATION_SEC * 0.45));

      const type1 = Math.random() < 0.6 ? 'AC' : Math.random() < 0.5 ? 'WA' : 'CE';
      const type2 = Math.random() < 0.6 ? 'AC' : Math.random() < 0.5 ? 'WA' : 'CE';

      items.push({ stu, delaySec: t1, type: type1 });
      items.push({ stu, delaySec: t2, type: type2 });
    }

    items.sort((a, b) => a.delaySec - b.delaySec);

    let finishedCount = 0;
    const tasks = items.map(async (item) => {
      const waitMs = item.delaySec * 1000;
      await new Promise((r) => setTimeout(r, waitMs));

      const code =
        item.type === 'AC' ? SOLUTION_AC : item.type === 'WA' ? SOLUTION_WA : SOLUTION_CE;

      const subStart = performance.now();
      firstSubmitTime = Math.min(firstSubmitTime, Date.now());
      try {
        const subRes = await fetch(`${API_BASE}/api/assignments/${assignmentId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: item.stu.cookie },
          body: JSON.stringify({ regions: { solve: code } }),
        });

        if (!subRes.ok) {
          finishedCount++;
          if (subRes.status === 429) http429Count++;
          else if (subRes.status >= 500) http5xxCount++;
          else otherHttpErrorCount++;
          return {
            id: null,
            studentCode: item.stu.code,
            type: item.type,
            error: `HTTP ${subRes.status}`,
            latencyMs: 0,
            queueTimeMs: 0,
            compileTimeMs: 0,
            runTimeMs: 0,
            status: 'FAILED',
          };
        }

        const subJson = await subRes.json();
        const subId = subJson.submission.id;

        let finished = null;
        for (let p = 0; p < 360; p++) {
          await new Promise((r) => setTimeout(r, 1000));
          const pollRes = await fetch(`${API_BASE}/api/submissions/${subId}`, {
            headers: { cookie: item.stu.cookie },
          });
          if (pollRes.ok) {
            const body = await pollRes.json();
            const st = body.submission?.status;
            if (st === 'COMPLETED' || st === 'SYSTEM_ERROR') {
              finished = body.submission;
              lastCompletedTime = Math.max(lastCompletedTime, Date.now());
              break;
            }
          }
        }

        finishedCount++;
        if (finishedCount % 10 === 0 || finishedCount === items.length) {
          console.log(
            `[Scenario B] Finished ${finishedCount}/${items.length} submissions (${finished?.status || 'LOST'}, ${finished?.tests?.[0]?.verdict || (finished?.compileOutput ? 'CE' : 'DONE')})...`
          );
        }

        const latencyMs = Math.round(performance.now() - subStart);

        // Fetch grader metrics
        let queueTimeMs = 0;
        let compileTimeMs = 0;
        let runTimeMs = 0;
        try {
          const mRes = await fetch(`${GRADER_BASE}/jobs/${subId}/metrics`, {
            headers: { 'X-Grader-Secret': GRADER_SECRET },
          });
          if (mRes.ok) {
            const mData = await mRes.json();
            queueTimeMs = mData.queueMs || 0;
            compileTimeMs = mData.compileMs || 0;
            runTimeMs = mData.runMs || 0;
          }
        } catch {
          // Ignore
        }

        return {
          id: subId,
          studentCode: item.stu.code,
          type: item.type,
          status: finished?.status || 'LOST',
          verdict: finished?.tests?.[0]?.verdict || (finished?.compileOutput ? 'CE' : 'DONE'),
          latencyMs,
          queueTimeMs,
          compileTimeMs,
          runTimeMs,
        };
      } catch (err) {
        finishedCount++;
        otherHttpErrorCount++;
        return {
          id: null,
          studentCode: item.stu.code,
          type: item.type,
          error: err.message,
          latencyMs: 0,
          queueTimeMs: 0,
          compileTimeMs: 0,
          runTimeMs: 0,
          status: 'ERROR',
        };
      }
    });

    const results = await Promise.all(tasks);
    submissionRecords.push(...results);
  }

  // Calculate Metrics
  const completed = submissionRecords.filter((r) => r.status === 'COMPLETED');
  const systemErrors = submissionRecords.filter((r) => r.status === 'SYSTEM_ERROR');
  const lost = submissionRecords.filter((r) => r.status === 'LOST');
  const latencies = completed.map((r) => r.latencyMs);
  const queueTimes = completed.map((r) => r.queueTimeMs).filter((t) => t > 0);
  const compileTimes = completed.map((r) => r.compileTimeMs).filter((t) => t > 0);
  const runTimes = completed.map((r) => r.runTimeMs).filter((t) => t > 0);

  const p50 = calcPercentile(latencies, 50);
  const p95 = calcPercentile(latencies, 95);
  const maxLat = latencies.length > 0 ? Math.max(...latencies) : 0;
  const avgLat =
    latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  const queueP50 = calcPercentile(queueTimes, 50);
  const queueP95 = calcPercentile(queueTimes, 95);
  const compileP50 = calcPercentile(compileTimes, 50);
  const compileP95 = calcPercentile(compileTimes, 95);
  const runP50 = calcPercentile(runTimes, 50);
  const runP95 = calcPercentile(runTimes, 95);

  const totalTimeSec = Math.max(1, (lastCompletedTime - firstSubmitTime) / 1000);
  const throughput = ((completed.length / totalTimeSec) * 60).toFixed(1);

  console.log('\n================================================================');
  console.log(`   Load Test Results — Scenario ${SCENARIO}                     `);
  console.log('================================================================');
  console.log(`Total submissions:     ${submissionRecords.length}`);
  console.log(`COMPLETED:             ${completed.length}`);
  console.log(`SYSTEM_ERROR:          ${systemErrors.length}`);
  console.log(`Lost submissions:      ${lost.length}`);
  console.log(`HTTP 429 Errors:       ${http429Count}`);
  console.log(`HTTP 5xx Errors:       ${http5xxCount}`);
  console.log(`Other Errors:          ${otherHttpErrorCount}`);
  console.log(`Test Duration:         ${totalTimeSec.toFixed(1)} s`);
  console.log(`p50 Latency:           ${p50} ms (${(p50 / 1000).toFixed(2)} s)`);
  console.log(`p95 Latency:           ${p95} ms (${(p95 / 1000).toFixed(2)} s)`);
  console.log(`Max Latency:           ${maxLat} ms (${(maxLat / 1000).toFixed(2)} s)`);
  console.log(`Avg Latency:           ${avgLat} ms (${(avgLat / 1000).toFixed(2)} s)`);
  console.log(`Queue Time (p50/p95):  ${queueP50} ms / ${queueP95} ms`);
  console.log(`Compile Time (p50/p95):${compileP50} ms / ${compileP95} ms`);
  console.log(`Run Time (p50/p95):    ${runP50} ms / ${runP95} ms`);
  console.log(`Throughput:            ${throughput} submissions/min`);
  console.log(`p95 <= 10s Target:     ${p95 <= 10000 ? 'PASS (<= 10s)' : 'EXCEEDED (> 10s)'}`);

  // Summary JSON output
  const summary = {
    scenario: SCENARIO,
    total: submissionRecords.length,
    completed: completed.length,
    systemErrors: systemErrors.length,
    lost: lost.length,
    http429Count,
    http5xxCount,
    durationSec: Number(totalTimeSec.toFixed(1)),
    p50Ms: p50,
    p95Ms: p95,
    maxMs: maxLat,
    avgMs: avgLat,
    queueTimeP50Ms: queueP50,
    queueTimeP95Ms: queueP95,
    compileTimeP50Ms: compileP50,
    compileTimeP95Ms: compileP95,
    runTimeP50Ms: runP50,
    runTimeP95Ms: runP95,
    throughputPerMin: Number(throughput),
    targetPass: p95 <= 10000,
  };

  console.log('\nSUMMARY_JSON:' + JSON.stringify(summary));

  if (lost.length > 0) {
    console.error('FAILED: Detected lost submissions!');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
