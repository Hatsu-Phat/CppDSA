import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

console.log(`[Attacks] Using API: ${API_BASE}`);
console.log(`[Attacks] Using Grader: ${GRADER_BASE}`);

const CANARY_SECRET_STRINGS = [
  'dev-grader-secret',
  'GRADER_SECRET',
  'DATABASE_URL',
  'HIDDEN_MARK_SECURITY_CANARY_XYZ999',
  'root:x:0:0:',
  'root:',
  'daemon:',
  'bin:',
];

const ATTACKS = [
  {
    id: 'TC-ATK-01',
    name: 'Fork bomb',
    file: 'fork_bomb.cpp',
    expectedVerdicts: ['RE', 'TLE', 'WA'],
  },
  {
    id: 'TC-ATK-02',
    name: 'Thread bomb',
    file: 'thread_bomb.cpp',
    expectedVerdicts: ['RE', 'TLE', 'MLE', 'WA'],
  },
  {
    id: 'TC-ATK-03',
    name: 'Memory bomb',
    file: 'memory_bomb.cpp',
    expectedVerdicts: ['MLE', 'RE'],
  },
  {
    id: 'TC-ATK-04',
    name: 'Read sensitive files (/etc/shadow, /proc/*/environ)',
    file: 'read_sensitive_files.cpp',
    expectedVerdicts: ['WA'],
  },
  {
    id: 'TC-ATK-05',
    name: 'Read other job directories',
    file: 'read_other_jobs.cpp',
    expectedVerdicts: ['WA'],
  },
  {
    id: 'TC-ATK-06',
    name: 'Network socket to db/api/internet',
    file: 'network_socket.cpp',
    expectedVerdicts: ['WA', 'RE'],
  },
  {
    id: 'TC-ATK-07',
    name: 'Stdout flood',
    file: 'stdout_flood.cpp',
    expectedVerdicts: ['RE'],
  },
  {
    id: 'TC-ATK-08',
    name: 'Stderr flood',
    file: 'stderr_flood.cpp',
    expectedVerdicts: ['TLE', 'RE'],
  },
  {
    id: 'TC-ATK-09',
    name: 'Long sleep',
    file: 'long_sleep.cpp',
    expectedVerdicts: ['TLE'],
  },
  {
    id: 'TC-ATK-10',
    name: 'Kill parent process tree',
    file: 'kill_parent.cpp',
    expectedVerdicts: ['WA'],
  },
  {
    id: 'TC-ATK-11',
    name: 'Execve /bin/sh shell escape',
    file: 'exec_shell.cpp',
    expectedVerdicts: ['WA', 'RE'],
  },
  {
    id: 'TC-ATK-12',
    name: 'Disk fill / large output file',
    file: 'disk_fill.cpp',
    expectedVerdicts: ['RE', 'WA'],
  },
  {
    id: 'TC-ATK-13',
    name: 'Compile bomb (deep recursive template)',
    file: 'compile_bomb.cpp',
    expectedVerdicts: ['CE'],
  },
  {
    id: 'TC-ATK-14',
    name: 'Compile read file (#include /etc/passwd)',
    file: 'compile_read_file.cpp',
    expectedVerdicts: ['CE'],
  },
  {
    id: 'TC-ATK-15',
    name: 'Static array binary bomb',
    file: 'binary_bomb.cpp',
    expectedVerdicts: ['CE'],
  },
];

const TEMPLATE_CODE = `#include <iostream>

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

const CORRECT_CANARY_CODE = `int solve(int a, int b) {
    return a + b;
}`;

async function main() {
  console.log('================================================================');
  console.log('   CppDSA Security Attacks Test Suite (>= 12 Attack Scenarios)  ');
  console.log('================================================================');

  // 1. Lecturer login
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
  const classRes = await fetch(`${API_BASE}/api/classrooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: lecCookie },
    body: JSON.stringify({
      name: `Security Test Classroom ${Date.now()}`,
      description: 'Sandbox penetration and attack tests',
    }),
  });
  const classData = await classRes.json();
  const classroomId = classData.classroom.id;

  // 3. Create TEMPLATE Assignment
  const assignRes = await fetch(`${API_BASE}/api/classrooms/${classroomId}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: lecCookie },
    body: JSON.stringify({
      title: 'Security Hardening Assignment',
      description: 'Assignment used for sandbox attack validation',
      mode: 'TEMPLATE',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      deadline: '2028-12-31T23:59:00Z',
      templateCode: TEMPLATE_CODE,
    }),
  });
  const assignData = await assignRes.json();
  const assignmentId = assignData.assignment.id;

  // Add hidden test with canary string
  await fetch(`${API_BASE}/api/assignments/${assignmentId}/tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: lecCookie },
    body: JSON.stringify({
      inputData: '10 20\nHIDDEN_MARK_SECURITY_CANARY_XYZ999\n',
      expectedOutput: '30\n',
      isHidden: true,
      orderIndex: 0,
    }),
  });

  // 4. Import pool of 6 students to respect rate limits (<= 6 submissions/min/student, <= 10 logins/min)
  const studentCount = 6;
  const students = [];
  const csvRows = ['student_code,full_name,email'];
  for (let i = 0; i < studentCount; i++) {
    const code = `ATK_STU_${Date.now()}_${i}`;
    const email = `atk_stu_${Date.now()}_${i}@cppdsa.local`;
    csvRows.push(`${code},Student Atk ${i},${email}`);
    students.push({ code, email });
  }

  const importRes = await fetch(`${API_BASE}/api/classrooms/${classroomId}/students/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: lecCookie },
    body: JSON.stringify({ csv: csvRows.join('\n') }),
  });
  const importData = await importRes.json();
  const created = importData.createdStudents || importData.students || [];

  for (const s of students) {
    const found = created.find((c) => (c.studentCode || c.student_code) === s.code);
    s.tempPassword = (found?.temporaryPassword || found?.temporary_password || '').trim();
    s.newPassword = 'NewAtkPassword123!';

    // Student login & change password
    const logRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: s.email, password: s.tempPassword }),
    });
    if (!logRes.ok) {
      throw new Error(`Student ${s.code} login failed: ${logRes.status} ${await logRes.text()}`);
    }
    const cookie = logRes.headers.get('set-cookie')?.split(';')[0];
    const changeRes = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ oldPassword: s.tempPassword, newPassword: s.newPassword }),
    });
    if (!changeRes.ok) {
      throw new Error(`Student ${s.code} change-password failed: ${changeRes.status}`);
    }
    s.cookie = cookie;
  }

  // 5. Run each Attack
  const results = [];
  let allPassed = true;
  let studentIdx = 0;

  for (const atk of ATTACKS) {
    const stu = students[studentIdx % students.length];
    studentIdx++;

    const atkFilePath = path.join(__dirname, 'attacks', atk.file);
    const atkCode = fs.readFileSync(atkFilePath, 'utf-8');

    console.log(`\nRunning attack [${atk.id}]: ${atk.name}...`);

    // Submit attack
    const subRes = await fetch(`${API_BASE}/api/assignments/${assignmentId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: stu.cookie },
      body: JSON.stringify({
        regions: { solve: atkCode },
      }),
    });

    if (!subRes.ok) {
      const errText = await subRes.text();
      console.error(`Attack submit failed with status: ${subRes.status} ${errText}`);
      results.push({ ...atk, verdict: `HTTP ${subRes.status}`, pass: false });
      allPassed = false;
      continue;
    }

    const subData = await subRes.json();
    const subId = subData.submission.id;

    // Poll until completed (up to 40s)
    let finishedSub = null;
    for (let poll = 0; poll < 40; poll++) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(`${API_BASE}/api/submissions/${subId}`, {
        headers: { cookie: stu.cookie },
      });
      if (pollRes.ok) {
        const body = await pollRes.json();
        if (body.submission?.status === 'COMPLETED' || body.submission?.status === 'SYSTEM_ERROR') {
          finishedSub = body.submission;
          break;
        }
      }
    }

    if (!finishedSub) {
      console.error(`Attack ${atk.id} timed out polling`);
      results.push({ ...atk, verdict: 'TIMEOUT', pass: false });
      allPassed = false;
      continue;
    }

    const hasCompileError = Boolean(
      finishedSub.compileOutput &&
      finishedSub.compileOutput.trim().length > 0 &&
      (!finishedSub.tests || finishedSub.tests.length === 0)
    );
    const testVerdict = finishedSub.tests?.[0]?.verdict;
    const verdict = hasCompileError ? 'CE' : testVerdict || 'WA';
    const compilePreview = (finishedSub.compileOutput || '').slice(0, 300).replace(/\r?\n/g, ' ');
    console.log(`Attack ${atk.id} finished with verdict: ${verdict}`);

    // Check 1: Verdict matches expected set (runtime attacks must NOT be CE, compile attacks must be CE)
    const verdictMatch = atk.expectedVerdicts.includes(verdict);

    // Check 2: Not AC
    const notAc =
      verdict !== 'AC' && (Number(finishedSub.score) === 0 || finishedSub.score === null);

    // Check 3: No secret or sensitive file leaked
    const subStr = JSON.stringify(finishedSub);
    let leakDetected = false;
    for (const secret of CANARY_SECRET_STRINGS) {
      if (subStr.includes(secret)) {
        console.error(`LEAK DETECTED in attack ${atk.id}: found "${secret}"`);
        leakDetected = true;
      }
    }

    // Check 4: Grader /health is 200 OK
    let graderHealthy = false;
    try {
      const gHealth = await fetch(`${GRADER_BASE}/health`);
      graderHealthy = gHealth.ok;
    } catch {
      graderHealthy = false;
    }

    // Check 5: Normal submission right after gets AC (using rotated student to stay under 6/min)
    const canaryStu = students[(studentIdx + 2) % students.length];
    const canarySubRes = await fetch(`${API_BASE}/api/assignments/${assignmentId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: canaryStu.cookie },
      body: JSON.stringify({
        regions: { solve: CORRECT_CANARY_CODE },
      }),
    });
    let canaryAc = false;
    if (canarySubRes.ok) {
      const cData = await canarySubRes.json();
      const cId = cData.submission.id;
      for (let p = 0; p < 30; p++) {
        await new Promise((r) => setTimeout(r, 1000));
        const cPoll = await fetch(`${API_BASE}/api/submissions/${cId}`, {
          headers: { cookie: canaryStu.cookie },
        });
        if (cPoll.ok) {
          const cBody = await cPoll.json();
          if (cBody.submission?.status === 'COMPLETED') {
            canaryAc =
              cBody.submission.tests?.[0]?.verdict === 'AC' || Number(cBody.submission.score) === 1;
            break;
          }
        }
      }
    }

    const pass = verdictMatch && notAc && !leakDetected && graderHealthy && canaryAc;
    if (!pass) allPassed = false;

    console.log(
      `Attack ${atk.id} result: ${pass ? 'PASS' : 'FAIL'} (Verdict: ${verdict}, Expected: [${atk.expectedVerdicts.join(',')}], Health: ${graderHealthy}, Canary AC: ${canaryAc})`
    );
    results.push({
      ...atk,
      verdict,
      compilePreview,
      leakDetected,
      graderHealthy,
      canaryAc,
      pass,
    });
  }

  // Print Summary Table
  console.log('\n================================================================');
  console.log(
    '| ID | Attack Scenario | Expected | Verdict | Compile Output Preview | No Leak | Grader OK | Next AC | Result |'
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const expStr = r.expectedVerdicts.join('/');
    console.log(
      `| ${r.id} | ${r.name.padEnd(35)} | ${expStr.padEnd(8)} | ${(r.verdict || 'ERR').padEnd(7)} | ${(r.compilePreview.slice(0, 40) || '-').padEnd(40)} | ${(!r.leakDetected ? 'YES' : 'LEAK').padEnd(7)} | ${(r.graderHealthy ? '200 OK' : 'FAIL').padEnd(9)} | ${(r.canaryAc ? 'AC' : 'FAIL').padEnd(7)} | ${(r.pass ? 'PASS' : 'FAIL').padEnd(6)} |`
    );
  }

  const passedCount = results.filter((r) => r.pass).length;
  console.log('\n================================================================');
  console.log(`Security Attacks Summary: ${passedCount}/${results.length} PASSED`);

  if (!allPassed || passedCount < 12) {
    console.error('FAILED: Not all attack scenarios passed!');
    process.exit(1);
  } else {
    console.log('SUCCESS: All attack scenarios passed cleanly with sandbox intact!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal attack runner error:', err);
  process.exit(1);
});
