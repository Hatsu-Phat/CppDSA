import http from 'node:http';
import { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { hashPassword } from '../src/utils/security';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

// Helper to run describe block only when TEST_DATABASE_URL is provided
const describeIntegration = TEST_DB_URL ? describe : describe.skip;

describeIntegration('Integration Tests with PostgreSQL & Mock Grader', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof buildApp>;
  let mockGraderServer: http.Server;
  let mockGraderUrl: string;
  const receivedGraderJobs: any[] = [];
  const GRADER_SECRET = 'test-grader-secret-token';

  // Test accounts
  let lecturerA: { id: string; email: string; cookie: string };
  let lecturerB: { id: string; email: string; cookie: string };
  let student1: { id: string; email: string; cookie: string };
  let student2: { id: string; email: string; cookie: string };
  let studentMustChangePwd: { id: string; email: string; cookie: string };

  let classroomAId: string;
  let assignmentTemplateId: string;
  let assignmentFreeId: string;
  let hiddenTestId: string;
  const CANARY_SECRET_STRING = 'CANARY_HIDDEN_DATA_XYZ_98765';

  beforeAll(async () => {
    // 1. Setup Mock Grader HTTP Server
    await new Promise<void>((resolve) => {
      mockGraderServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', queueLength: 0, activeJobs: 0 }));
            return;
          }

          if (req.url === '/jobs' && req.method === 'POST') {
            const secret = req.headers['x-grader-secret'];
            if (secret !== GRADER_SECRET) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
              return;
            }

            const parsed = JSON.parse(body || '{}');
            receivedGraderJobs.push(parsed);
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'queued', submissionId: parsed.submissionId }));
            return;
          }

          res.writeHead(404);
          res.end();
        });
      });

      mockGraderServer.listen(0, '127.0.0.1', () => {
        const port = (mockGraderServer.address() as AddressInfo).port;
        mockGraderUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 2. Setup PostgreSQL connection & ensure schema
    pool = new pg.Pool({ connectionString: TEST_DB_URL, max: 10 });

    // Run schema migrations directly
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(255) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        full_name varchar(255) NOT NULL,
        role varchar(50) NOT NULL,
        must_change_password boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT current_timestamp,
        updated_at timestamptz NOT NULL DEFAULT current_timestamp
      );

      CREATE TABLE IF NOT EXISTS classrooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        description text,
        lecturer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT current_timestamp,
        updated_at timestamptz NOT NULL DEFAULT current_timestamp
      );

      CREATE TABLE IF NOT EXISTS classroom_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
        student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_code varchar(50) NOT NULL,
        enrolled_at timestamptz NOT NULL DEFAULT current_timestamp,
        CONSTRAINT unique_classroom_student UNIQUE (classroom_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
        title varchar(255) NOT NULL,
        description text,
        mode varchar(50) NOT NULL,
        time_limit_ms integer NOT NULL DEFAULT 1000,
        memory_limit_mb integer NOT NULL DEFAULT 256,
        deadline timestamptz,
        template_code text,
        entry_point_spec jsonb,
        created_at timestamptz NOT NULL DEFAULT current_timestamp,
        updated_at timestamptz NOT NULL DEFAULT current_timestamp
      );

      CREATE TABLE IF NOT EXISTS test_cases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        order_index integer NOT NULL DEFAULT 1,
        input_data text NOT NULL,
        expected_output text NOT NULL,
        is_hidden boolean NOT NULL DEFAULT true,
        is_sample boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT current_timestamp
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        submitted_code text NOT NULL,
        entry_point_declaration jsonb,
        status varchar(20) NOT NULL DEFAULT 'PENDING',
        score numeric(5, 2) NOT NULL DEFAULT 0.00,
        total_tests integer NOT NULL DEFAULT 0,
        passed_tests integer NOT NULL DEFAULT 0,
        is_late boolean NOT NULL DEFAULT false,
        retry_count integer NOT NULL DEFAULT 0,
        compile_output text,
        created_at timestamptz NOT NULL DEFAULT current_timestamp,
        updated_at timestamptz NOT NULL DEFAULT current_timestamp,
        finished_at timestamptz
      );

      CREATE TABLE IF NOT EXISTS submission_test_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        test_case_id uuid NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
        verdict varchar(10) NOT NULL,
        execution_time_ms integer,
        memory_used_kb integer,
        student_output_excerpt text,
        created_at timestamptz NOT NULL DEFAULT current_timestamp,
        CONSTRAINT unique_submission_test_case UNIQUE (submission_id, test_case_id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash varchar(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT current_timestamp
      );
    `);

    // Clean test data from tables
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM submission_test_results');
    await pool.query('DELETE FROM submissions');
    await pool.query('DELETE FROM test_cases');
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM classroom_enrollments');
    await pool.query('DELETE FROM classrooms');
    await pool.query('DELETE FROM users');

    // 3. Create Fastify App
    app = buildApp({
      pool,
      config: {
        graderUrl: mockGraderUrl,
        graderSecret: GRADER_SECRET,
        apiBaseUrl: 'http://127.0.0.1:4000',
        maxStudentCodeBytes: 65536,
        maxTemplateBytes: 65536,
        maxTestCaseBytes: 1048576,
        maxTestCasesPerAssignment: 50,
        maxCsvRows: 500,
      },
    });

    await app.ready();

    // 4. Seed test users
    const defaultPwdHash = await hashPassword('Password123!');

    // Lecturer A
    const resLA = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password)
       VALUES ('lecturera@cppdsa.local', $1, 'Giang Vien A', 'LECTURER', false) RETURNING id`,
      [defaultPwdHash]
    );
    lecturerA = { id: resLA.rows[0].id, email: 'lecturera@cppdsa.local', cookie: '' };

    // Lecturer B
    const resLB = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password)
       VALUES ('lecturerb@cppdsa.local', $1, 'Giang Vien B', 'LECTURER', false) RETURNING id`,
      [defaultPwdHash]
    );
    lecturerB = { id: resLB.rows[0].id, email: 'lecturerb@cppdsa.local', cookie: '' };

    // Student 1
    const resS1 = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password)
       VALUES ('student1@cppdsa.local', $1, 'Sinh Vien 1', 'STUDENT', false) RETURNING id`,
      [defaultPwdHash]
    );
    student1 = { id: resS1.rows[0].id, email: 'student1@cppdsa.local', cookie: '' };

    // Student 2
    const resS2 = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password)
       VALUES ('student2@cppdsa.local', $1, 'Sinh Vien 2', 'STUDENT', false) RETURNING id`,
      [defaultPwdHash]
    );
    student2 = { id: resS2.rows[0].id, email: 'student2@cppdsa.local', cookie: '' };

    // Student must_change_password = true
    const resSmcp = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password)
       VALUES ('mustchange@cppdsa.local', $1, 'Sinh Vien New', 'STUDENT', true) RETURNING id`,
      [defaultPwdHash]
    );
    studentMustChangePwd = { id: resSmcp.rows[0].id, email: 'mustchange@cppdsa.local', cookie: '' };

    // Helper to login and get cookie
    async function login(email: string) {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'Password123!' },
      });
      const cookieHeader = resp.headers['set-cookie'];
      const rawCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      return rawCookie ? rawCookie.split(';')[0] : '';
    }

    lecturerA.cookie = await login(lecturerA.email);
    lecturerB.cookie = await login(lecturerB.email);
    student1.cookie = await login(student1.email);
    student2.cookie = await login(student2.email);
    studentMustChangePwd.cookie = await login(studentMustChangePwd.email);
  });

  afterAll(async () => {
    if (mockGraderServer) {
      await new Promise<void>((resolve) => mockGraderServer.close(() => resolve()));
    }
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
  });

  // ==========================================
  // AUTH TESTS
  // ==========================================

  it('[TEST_AUTH_LOGIN] logs in and sets sid cookie with Lax and httpOnly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: lecturerA.email, password: 'Password123!' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe(lecturerA.email);
    expect(body.user.role).toBe('LECTURER');
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('sid=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
  });

  it('[TEST_AUTH_ME] returns current user information', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(lecturerA.email);
  });

  it('[TEST_AUTH_CHANGE_PASSWORD] changes user password and resets must_change_password flag', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: studentMustChangePwd.cookie },
      payload: { oldPassword: 'Password123!', newPassword: 'BrandNewPassword456!' },
    });
    expect(res.statusCode).toBe(200);

    // Verify DB flag
    const dbRes = await pool.query('SELECT must_change_password FROM users WHERE id = $1', [
      studentMustChangePwd.id,
    ]);
    expect(dbRes.rows[0].must_change_password).toBe(false);
  });

  it('[TEST_AUTH_LOGOUT] removes session from db and clears sid cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('sid=;');

    // Re-login lecturerA for subsequent tests
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: lecturerA.email, password: 'Password123!' },
    });
    const cookieHeader = loginRes.headers['set-cookie'] as string;
    lecturerA.cookie = cookieHeader.split(';')[0];
  });

  // ==========================================
  // CLASSROOMS & CSV IMPORT TESTS
  // ==========================================

  it('[TEST_CLASSROOMS_CREATE] Lecturer creates classroom', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/classrooms',
      headers: { cookie: lecturerA.cookie },
      payload: { name: 'DSA - Nhom 01', description: 'Mon Cau truc du lieu va Giai thuat' },
    });
    expect(res.statusCode).toBe(201);
    classroomAId = res.json().classroom.id;
    expect(classroomAId).toBeDefined();
  });

  it('[TEST_CLASSROOMS_LIST] lists classrooms for lecturer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/classrooms',
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().classrooms.some((c: any) => c.id === classroomAId)).toBe(true);
  });

  it('[TEST_CLASSROOMS_GET] gets classroom details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/classrooms/${classroomAId}`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().classroom.name).toBe('DSA - Nhom 01');
  });

  it('[TEST_CLASSROOMS_UPDATE] Lecturer updates classroom info', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/classrooms/${classroomAId}`,
      headers: { cookie: lecturerA.cookie },
      payload: { name: 'DSA - Nhom 01 (Cap Nhat)' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().classroom.name).toBe('DSA - Nhom 01 (Cap Nhat)');
  });

  it('[TEST_STUDENTS_IMPORT_CSV] imports students with per-row validation (US-01, AC-US-01-2)', async () => {
    const csvData = `student_code,full_name,email
2026001,Student One,student1@cppdsa.local
2026002,Student Two,student2@cppdsa.local
2026003,,empty_name@example.com
2026001,Student Dup,dup@example.com
2026005,Student Five,s5@cppdsa.local`;

    const res = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/students/import`,
      headers: { cookie: lecturerA.cookie },
      payload: { csv: csvData },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.successCount).toBe(3); // 2026001, 2026002, 2026005
    expect(body.errorCount).toBe(2); // row 4 empty name, row 5 duplicate code
  });

  it('[TEST_STUDENTS_LIST] lists enrolled students in classroom', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/classrooms/${classroomAId}/students`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    const students = res.json().students;
    expect(students.length).toBeGreaterThanOrEqual(2);
    expect(students.some((s: any) => s.studentCode === '2026001')).toBe(true);
  });

  it('[TEST_STUDENTS_RESET_PASSWORD] Lecturer resets student password (US-08)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/students/${student1.id}/reset-password`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.temporaryPassword).toBeDefined();

    // Verify student must_change_password flag set to true
    const dbRes = await pool.query('SELECT must_change_password FROM users WHERE id = $1', [
      student1.id,
    ]);
    expect(dbRes.rows[0].must_change_password).toBe(true);

    // Re-login student1 with new temporary password to restore valid session
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: student1.email, password: body.temporaryPassword },
    });
    expect(loginRes.statusCode).toBe(200);
    student1.cookie = (loginRes.headers['set-cookie'] as string).split(';')[0];

    // Change password back to Password123! so must_change_password is false
    await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: student1.cookie },
      payload: { oldPassword: body.temporaryPassword, newPassword: 'Password123!' },
    });
  });

  // ==========================================
  // ASSIGNMENTS & TEST CASES TESTS
  // ==========================================

  it('[TEST_ASSIGNMENTS_CREATE] Lecturer creates TEMPLATE mode assignment', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const templateCode = `
      #include <iostream>
      // STUDENT_BEGIN solve
      int solve(int a, int b) { return 0; }
      // STUDENT_END
      int main() { return 0; }
    `;

    const res = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Bai 1: Tong hai so (Template)',
        description: 'Viet ham solve tinh tong hai so',
        mode: 'TEMPLATE',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        deadline,
        templateCode,
      },
    });

    expect(res.statusCode).toBe(201);
    assignmentTemplateId = res.json().assignment.id;
    expect(assignmentTemplateId).toBeDefined();
  });

  it('rejects TEMPLATE assignment creation if markers are invalid (AC-US-02-2)', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const badTemplate = `
      // STUDENT_BEGIN solve
      int solve() {}
      // Missing STUDENT_END!
    `;

    const res = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Bad Template',
        mode: 'TEMPLATE',
        deadline,
        templateCode: badTemplate,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_TEMPLATE_MARKERS');
  });

  it('enforces template code 64 KB limit boundary (65536 bytes OK, 65537 bytes rejected 413)', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const prefix = '// STUDENT_BEGIN r\n';
    const suffix = '\n// STUDENT_END';
    const needed = 65536 - prefix.length - suffix.length;
    const exact64k = prefix + 'A'.repeat(needed) + suffix;
    expect(Buffer.byteLength(exact64k, 'utf8')).toBe(65536);

    const resOk = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Exact 64KB Template',
        mode: 'TEMPLATE',
        deadline,
        templateCode: exact64k,
      },
    });
    expect(resOk.statusCode).toBe(201);

    // Over 64 KB by 1 byte
    const over64k = exact64k + 'X';
    expect(Buffer.byteLength(over64k, 'utf8')).toBe(65537);
    const resOver = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Over 64KB Template',
        mode: 'TEMPLATE',
        deadline,
        templateCode: over64k,
      },
    });
    expect(resOver.statusCode).toBe(413);
    expect(resOver.json().error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('creates FREE mode assignment with entry point spec', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const harness = `
      #include <iostream>
      int main() {
        std::cout << CPPDSA_ENTRY(2, 3) << std::endl;
        return 0;
      }
    `;

    const res = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Bai 2: Free Mode Solve',
        mode: 'FREE',
        deadline,
        entryPointSpec: {
          harness,
          entry: {
            type: 'function',
            name: 'addTwo',
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    assignmentFreeId = res.json().assignment.id;
    expect(assignmentFreeId).toBeDefined();
  });

  it('rejects FREE mode assignment when entry name is invalid C++ keyword', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Invalid Free Mode',
        mode: 'FREE',
        deadline,
        entryPointSpec: {
          harness: 'int main() {}',
          entry: {
            type: 'function',
            name: 'class', // C++ keyword
          },
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('không hợp lệ hoặc trùng từ khóa C++');
  });

  it('[TEST_ASSIGNMENTS_LIST] lists assignments in classroom', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().assignments.length).toBeGreaterThanOrEqual(2);
  });

  it('[TEST_ASSIGNMENTS_GET] gets assignment details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().assignment.title).toContain('Tong hai so');
  });

  it('[TEST_ASSIGNMENTS_UPDATE] Lecturer updates assignment', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}`,
      headers: { cookie: lecturerA.cookie },
      payload: { description: 'Updated assignment description' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().assignment.description).toBe('Updated assignment description');
  });

  // TEST CASES CRUD
  it('[TEST_CASES_CREATE] adds hidden test cases and sample test case', async () => {
    // 1. Regular hidden test
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/tests`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        inputData: '3 5\n',
        expectedOutput: '8\n',
        isHidden: true,
        isSample: false,
      },
    });
    expect(res1.statusCode).toBe(201);
    hiddenTestId = res1.json().testCase.id;

    // 2. Sample test case
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/tests`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        inputData: '1 2\n',
        expectedOutput: '3\n',
        isHidden: false,
        isSample: true,
      },
    });
    expect(res2.statusCode).toBe(201);

    // 3. Canary hidden test case (for leak test)
    const resCanary = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/tests`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        inputData: `INPUT_${CANARY_SECRET_STRING}\n`,
        expectedOutput: `OUTPUT_${CANARY_SECRET_STRING}\n`,
        isHidden: true,
      },
    });
    expect(resCanary.statusCode).toBe(201);
    expect(resCanary.json().testCase.id).toBeDefined();
  });

  it('enforces 1 MB limit boundary for test case input/expected (1048576 bytes OK, 1048577 rejected 413)', async () => {
    const exact1Mb = 'X'.repeat(1048576);
    expect(Buffer.byteLength(exact1Mb, 'utf8')).toBe(1048576);

    const resOk = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/tests`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        inputData: exact1Mb,
        expectedOutput: 'OK',
        isHidden: true,
      },
    });
    expect(resOk.statusCode).toBe(201);

    const over1Mb = exact1Mb + 'Y';
    expect(Buffer.byteLength(over1Mb, 'utf8')).toBe(1048577);
    const resOver = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/tests`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        inputData: over1Mb,
        expectedOutput: 'OK',
        isHidden: true,
      },
    });
    expect(resOver.statusCode).toBe(413);
    expect(resOver.json().error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('[TEST_CASES_LIST] lists all test cases for assignment (Lecturer only)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}/tests`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().testCases.length).toBeGreaterThanOrEqual(3);
  });

  it('[TEST_CASES_UPDATE] Lecturer updates test case', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/tests/${hiddenTestId}`,
      headers: { cookie: lecturerA.cookie },
      payload: { expectedOutput: '8\n' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('[TEST_CASES_DELETE] Lecturer deletes test case', async () => {
    // Create temporary test case to delete
    const resCreate = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/tests`,
      headers: { cookie: lecturerA.cookie },
      payload: { inputData: '9 9\n', expectedOutput: '18\n' },
    });
    const tempId = resCreate.json().testCase.id;

    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/tests/${tempId}`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(resDel.statusCode).toBe(200);
  });

  // ==========================================
  // SUBMISSIONS & GRADER INTEGRATION
  // ==========================================

  let submission1Id: string;

  it('[TEST_SUBMISSIONS_CREATE] Student submits template mode solution', async () => {
    receivedGraderJobs.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/submissions`,
      headers: { cookie: student1.cookie },
      payload: {
        regions: {
          solve: 'int solve(int a, int b) { return a + b; }',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    submission1Id = body.submission.id;
    expect(submission1Id).toBeDefined();
    expect(body.submission.isLate).toBe(false);

    // Verify job sent to grader mock
    expect(receivedGraderJobs).toHaveLength(1);
    expect(receivedGraderJobs[0].submissionId).toBe(submission1Id);
    expect(receivedGraderJobs[0].mode).toBe('template');
  });

  it('enforces student code 64 KB limit boundary on submission', async () => {
    const code64k = 'int x = 0; /* ' + 'A'.repeat(65530) + ' */';
    expect(Buffer.byteLength(code64k, 'utf8')).toBeGreaterThan(65536);

    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/submissions`,
      headers: { cookie: student1.cookie },
      payload: {
        regions: {
          solve: code64k,
        },
      },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects submission with missing template regions (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/submissions`,
      headers: { cookie: student1.cookie },
      payload: {
        regions: {
          wrong_region: 'int x = 1;',
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_TEMPLATE_REGIONS');
  });

  it('[TEST_INTERNAL_GRADER_CALLBACK] receives grader callback and updates submission results', async () => {
    const callbackPayload = {
      submissionId: submission1Id,
      status: 'DONE',
      verdict: 'AC',
      score: 1.0,
      tests: [
        { index: 1, verdict: 'AC', timeMs: 12, memoryKb: 1024 },
        { index: 2, verdict: 'AC', timeMs: 15, memoryKb: 1024 },
      ],
      compileMessage: '',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': GRADER_SECRET },
      payload: callbackPayload,
    });

    expect(res.statusCode).toBe(200);

    // Verify DB update
    const dbRes = await pool.query(
      'SELECT status, score, passed_tests FROM submissions WHERE id = $1',
      [submission1Id]
    );
    expect(dbRes.rows[0].status).toBe('COMPLETED');
    expect(Number(dbRes.rows[0].score)).toBe(1.0);
  });

  it('ensures grader callback is IDEMPOTENT (duplicate callback does not duplicate test results)', async () => {
    const countBefore = await pool.query(
      'SELECT COUNT(*) FROM submission_test_results WHERE submission_id = $1',
      [submission1Id]
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': GRADER_SECRET },
      payload: {
        submissionId: submission1Id,
        status: 'DONE',
        verdict: 'AC',
        score: 1.0,
        tests: [{ index: 1, verdict: 'AC', timeMs: 12, memoryKb: 1024 }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('already processed');

    const countAfter = await pool.query(
      'SELECT COUNT(*) FROM submission_test_results WHERE submission_id = $1',
      [submission1Id]
    );
    expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
  });

  it('[TEST_SUBMISSIONS_LIST] lists submissions for student (only own submissions)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}/submissions`,
      headers: { cookie: student1.cookie },
    });
    expect(res.statusCode).toBe(200);
    const subs = res.json().submissions;
    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs.every((s: any) => s.assignmentId === assignmentTemplateId)).toBe(true);
  });

  it('[TEST_SUBMISSIONS_GET] gets submission details (Student sees verdict, time, memory, NO hidden data)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission1Id}`,
      headers: { cookie: student1.cookie },
    });
    expect(res.statusCode).toBe(200);
    const sub = res.json().submission;
    expect(sub.id).toBe(submission1Id);
    expect(sub.tests).toBeDefined();
    expect(sub.tests[0].verdict).toBe('AC');
    expect(sub.tests[0].executionTimeMs).toBeDefined();

    // Verify security: student must NOT receive hidden test fields
    expect(sub.tests[0].inputData).toBeUndefined();
    expect(sub.tests[0].expectedOutput).toBeUndefined();
    expect(sub.tests[0].studentOutputExcerpt).toBeUndefined();
  });

  it('[TEST_CLASSROOM_SUBMISSIONS_LIST] Lecturer views all submissions with filters (AC-US-05-1)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/classrooms/${classroomAId}/submissions?status=COMPLETED&minScore=0.5`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    const subs = res.json().submissions;
    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs[0].studentName).toBeDefined();
  });

  // ==========================================
  // DEADLINE & LATE SUBMISSION & MAX SCORE
  // ==========================================

  it('[TEST_GRADES_EXPORT_CSV] verifies deadline boundary, late flag, and max score before deadline', async () => {
    // 1. Create assignment with fixed deadline
    const deadlineTime = new Date('2026-11-01T12:00:00.000Z');
    const assignRes = await pool.query(
      `INSERT INTO assignments (classroom_id, title, mode, time_limit_ms, memory_limit_mb, deadline)
       VALUES ($1, 'Deadline Test Assignment', 'FREE', 1000, 256, $2) RETURNING id`,
      [classroomAId, deadlineTime]
    );
    const testAssignId = assignRes.rows[0].id;

    // 2. Submit exactly at deadline (considered on-time)
    const onTimeSubRes = await pool.query(
      `INSERT INTO submissions (assignment_id, student_id, submitted_code, status, score, is_late, created_at)
       VALUES ($1, $2, 'code1', 'COMPLETED', 0.80, false, $3) RETURNING id`,
      [testAssignId, student2.id, deadlineTime]
    );
    expect(onTimeSubRes.rowCount).toBe(1);

    // 3. Submit 1 ms after deadline (considered late)
    const lateTime = new Date(deadlineTime.getTime() + 1);
    const lateSubRes = await pool.query(
      `INSERT INTO submissions (assignment_id, student_id, submitted_code, status, score, is_late, created_at)
       VALUES ($1, $2, 'code2', 'COMPLETED', 1.00, true, $3) RETURNING id`,
      [testAssignId, student2.id, lateTime]
    );
    expect(lateSubRes.rowCount).toBe(1);

    // 4. Export grades CSV
    const csvRes = await app.inject({
      method: 'GET',
      url: `/api/classrooms/${classroomAId}/grades/csv?assignmentId=${testAssignId}`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(csvRes.statusCode).toBe(200);
    const csv = csvRes.body;

    // The official score must be 0.8 (the on-time submission), NOT replaced by late 1.00
    // And is_late column must be true because student has late submission
    expect(csv).toContain('student2@cppdsa.local');
    expect(csv).toContain('0.8');
    expect(csv).toContain('true');
  });

  // ==========================================
  // SYSTEM WARMUP
  // ==========================================

  it('[TEST_SYSTEM_WARMUP] Lecturer triggers system warmup (US-07)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/system/warmup',
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.grader).toBe('ok');
  });

  // ==========================================
  // SECURITY & RBAC NEGATIVE TESTS
  // ==========================================

  it('RBAC Negative: Unauthenticated request to protected route returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/classrooms',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('UNAUTHORIZED');
  });

  it('RBAC Negative: Student cannot call lecturer endpoint (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/classrooms',
      headers: { cookie: student1.cookie },
      payload: { name: 'Illegal Classroom' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('RBAC Negative: Lecturer A cannot access or modify Lecturer B classroom (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/classrooms/${classroomAId}`,
      headers: { cookie: lecturerB.cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('RBAC Negative: Student cannot view hidden test cases endpoint (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}/tests`,
      headers: { cookie: student1.cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('RBAC Negative: Student cannot view another student submission (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission1Id}`,
      headers: { cookie: student2.cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('RBAC Negative: must_change_password blocks access to general routes with 403 PASSWORD_CHANGE_REQUIRED', async () => {
    // Set student2 must_change_password = true
    await pool.query('UPDATE users SET must_change_password = true WHERE id = $1', [student2.id]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/classrooms',
      headers: { cookie: student2.cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('PASSWORD_CHANGE_REQUIRED');

    // Reset back
    await pool.query('UPDATE users SET must_change_password = false WHERE id = $1', [student2.id]);
  });

  it('RBAC Negative: Grader callback with invalid secret returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': 'wrong-secret' },
      payload: {
        submissionId: submission1Id,
        status: 'DONE',
        verdict: 'AC',
        score: 1.0,
        tests: [],
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('RBAC Negative: Grader callback with missing secret returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      payload: {
        submissionId: submission1Id,
        status: 'DONE',
        verdict: 'AC',
        score: 1.0,
        tests: [],
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('RBAC Negative: Grader callback when server secret is empty returns 503', async () => {
    const noSecretApp = buildApp({
      pool,
      config: { graderSecret: '' },
    });
    await noSecretApp.ready();

    const res = await noSecretApp.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': 'any' },
      payload: {
        submissionId: submission1Id,
        status: 'DONE',
        verdict: 'AC',
        score: 1.0,
        tests: [],
      },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('SERVICE_UNAVAILABLE');
    await noSecretApp.close();
  });

  // ==========================================
  // CANARY LEAK TEST (Acceptance Criteria 8)
  // ==========================================

  it('[CANARY LEAK TEST] Hidden test data NEVER leaks through any student endpoint', async () => {
    // 1. Assignment details
    const assignRes = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}`,
      headers: { cookie: student1.cookie },
    });
    expect(assignRes.body).not.toContain(CANARY_SECRET_STRING);

    // 2. Assignment list
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: student1.cookie },
    });
    expect(listRes.body).not.toContain(CANARY_SECRET_STRING);

    // 3. Submissions list
    const subListRes = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}/submissions`,
      headers: { cookie: student1.cookie },
    });
    expect(subListRes.body).not.toContain(CANARY_SECRET_STRING);

    // 4. Submission detail
    const subDetailRes = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission1Id}`,
      headers: { cookie: student1.cookie },
    });
    expect(subDetailRes.body).not.toContain(CANARY_SECRET_STRING);
  });

  // ==========================================
  // RECOVERY PURE LOGIC & ON-REQUEST TRIGGER
  // ==========================================

  it('Recovery: submissions PENDING > 2 minutes are retried up to 2 times then marked SYSTEM_ERROR', async () => {
    // Create submission stalled 3 minutes ago
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
    const subRes = await pool.query(
      `INSERT INTO submissions (assignment_id, student_id, submitted_code, status, retry_count, updated_at)
       VALUES ($1, $2, 'code', 'PENDING', 0, $3) RETURNING id`,
      [assignmentTemplateId, student1.id, threeMinAgo]
    );
    const recoverySubId = subRes.rows[0].id;

    // Trigger API request which runs recovery hook
    receivedGraderJobs.length = 0;
    await app.inject({ method: 'GET', url: '/health' });

    // Wait a brief moment for async hook
    await new Promise((r) => setTimeout(r, 200));

    const check1 = await pool.query('SELECT retry_count, status FROM submissions WHERE id = $1', [
      recoverySubId,
    ]);
    expect(check1.rows[0].retry_count).toBe(1);

    // Simulate second retry
    await pool.query('UPDATE submissions SET retry_count = 2, updated_at = $1 WHERE id = $2', [
      threeMinAgo,
      recoverySubId,
    ]);

    await app.inject({ method: 'GET', url: '/health' });
    await new Promise((r) => setTimeout(r, 200));

    const check2 = await pool.query('SELECT status FROM submissions WHERE id = $1', [
      recoverySubId,
    ]);
    expect(check2.rows[0].status).toBe('SYSTEM_ERROR');
  });

  // ==========================================
  // CLEANUP TEST (DELETE ASSIGNMENT & CLASSROOM)
  // ==========================================

  it('[TEST_ASSIGNMENTS_DELETE] Lecturer deletes assignment', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${assignmentFreeId}`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
  });

  it('[TEST_CLASSROOMS_DELETE] Lecturer deletes classroom', async () => {
    // Create temp classroom to delete
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/classrooms',
      headers: { cookie: lecturerA.cookie },
      payload: { name: 'Classroom to delete' },
    });
    const tempClassId = createRes.json().classroom.id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/classrooms/${tempClassId}`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
  });
});
