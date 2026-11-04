import http from 'node:http';
import { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JudgeResult } from '@cppdsa/shared';
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
  let mockGraderHealthHits = 0;
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
  let simulatedNow = new Date('2026-11-01T10:00:00.000Z');
  let defaultPwdHash: string;
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
            mockGraderHealthHits++;
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
        statement_storage varchar(16),
        statement_file_id text,
        statement_file_name varchar(255),
        statement_file_size integer,
        created_at timestamptz NOT NULL DEFAULT current_timestamp,
        updated_at timestamptz NOT NULL DEFAULT current_timestamp
      );

      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS statement_storage varchar(16);
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS statement_file_id text;
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS statement_file_name varchar(255);
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS statement_file_size integer;

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
      now: () => simulatedNow,
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
    defaultPwdHash = await hashPassword('Password123!');

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
    expect(body.errors[0].error).not.toContain('syntax error');
    expect(body.errors[1].error).not.toContain('syntax error');

    // Verify createdStudents and students list
    expect(body.students).toBeDefined();
    expect(body.createdStudents).toHaveLength(1);
    const createdStudent = body.createdStudents[0];
    expect(createdStudent.studentCode).toBe('2026005');
    expect(createdStudent.email).toBe('s5@cppdsa.local');
    expect(createdStudent.temporaryPassword).toBeDefined();

    const existingStudent = body.students.find((s: any) => s.studentCode === '2026001');
    expect(existingStudent.status).toBe('existing');
    expect(existingStudent.temporaryPassword).toBeUndefined();

    // Verify student 2026005 can login with temporary password and must change password
    const s5LoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 's5@cppdsa.local', password: createdStudent.temporaryPassword },
    });
    expect(s5LoginRes.statusCode).toBe(200);
    expect(s5LoginRes.json().user.mustChangePassword).toBe(true);

    const s5Cookie = (s5LoginRes.headers['set-cookie'] as string).split(';')[0];
    const s5AccessBlocked = await app.inject({
      method: 'GET',
      url: '/api/classrooms',
      headers: { cookie: s5Cookie },
    });
    expect(s5AccessBlocked.statusCode).toBe(403);
    expect(s5AccessBlocked.json().error).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('enforces CSV 500 rows limit boundary via API (500 data lines accepted, 501 rejected with 400 CSV_TOO_MANY_ROWS)', async () => {
    const crRes = await app.inject({
      method: 'POST',
      url: '/api/classrooms',
      headers: { cookie: lecturerA.cookie },
      payload: { name: 'Classroom CSV 500 Limit' },
    });
    const cId = crRes.json().classroom.id;

    // Pre-insert 500 users so CSV import processes them without 500 individual bcrypt hashes
    const userValues: string[] = [];
    for (let i = 1; i <= 500; i++) {
      userValues.push(
        `('c500_${i}@example.com', '${defaultPwdHash}', 'Student ${i}', 'STUDENT', false)`
      );
    }
    await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password) VALUES ${userValues.join(',')}`
    );

    let csv500 = 'student_code,full_name,email\n';
    for (let i = 1; i <= 500; i++) {
      csv500 += `C500_${String(i).padStart(4, '0')},Student ${i},c500_${i}@example.com\n`;
    }
    const res500 = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${cId}/students/import`,
      headers: { cookie: lecturerA.cookie },
      payload: { csv: csv500 },
    });
    expect(res500.statusCode).toBe(200);

    const csv501 = csv500 + 'C500_0501,Student 501,c500_501@example.com\n';
    const res501 = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${cId}/students/import`,
      headers: { cookie: lecturerA.cookie },
      payload: { csv: csv501 },
    });
    expect(res501.statusCode).toBe(400);
    expect(res501.json().error).toBe('CSV_TOO_MANY_ROWS');
  }, 30000);

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

  it('creates FREE mode assignment without entryPointSpec (T-0012)', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Bai 2: Free Mode Solve',
        mode: 'FREE',
        deadline,
      },
    });

    expect(res.statusCode).toBe(201);
    assignmentFreeId = res.json().assignment.id;
    expect(assignmentFreeId).toBeDefined();
    expect(res.json().assignment.entry_point_spec).toBeNull();
  });

  it('creates FREE mode assignment with entryPointSpec ignored and saved as NULL (T-0012)', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Free Mode Ignored Spec',
        mode: 'FREE',
        deadline,
        entryPointSpec: {
          harness: 'int main() {}',
          entry: {
            type: 'function',
            name: 'class', // Ignored even if keyword
          },
        },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().assignment.entry_point_spec).toBeNull();
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

  // ==========================================
  // STATEMENT PDF TESTS (T-0014)
  // ==========================================
  const validPdfBytes = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF'
  );
  const replacementPdfBytes = Buffer.from(
    '%PDF-1.4\n2 0 obj\n<<\n/Title (Replacement PDF)\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF'
  );

  it('[TEST_ASSIGNMENT_STATEMENT_UPLOAD] uploads PDF, validates format, bounds, roles, and replaces old file', async () => {
    // 1. Valid PDF upload by Lecturer A
    const resOk = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: {
        cookie: lecturerA.cookie,
        'content-type': 'application/pdf',
        'x-file-name': encodeURIComponent('Đề bài 1.pdf'),
      },
      payload: validPdfBytes,
    });
    expect(resOk.statusCode).toBe(200);
    const bodyOk = resOk.json();
    expect(bodyOk.statement.name).toBe('Đề bài 1.pdf');
    expect(bodyOk.statement.size).toBe(validPdfBytes.length);

    // Verify GET /api/assignments/:id returns statement without leaking internal storage or file id
    const resGetAssign = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(resGetAssign.statusCode).toBe(200);
    const assignObj = resGetAssign.json().assignment;
    expect(assignObj.statement).toEqual({
      name: 'Đề bài 1.pdf',
      size: validPdfBytes.length,
    });
    expect(assignObj.statement_file_id).toBeUndefined();
    expect(assignObj.statement_storage).toBeUndefined();

    // Check DB has file id
    const dbRow = await pool.query(
      'SELECT statement_storage, statement_file_id, statement_file_name, statement_file_size FROM assignments WHERE id = $1',
      [assignmentTemplateId]
    );
    expect(dbRow.rows[0].statement_storage).toBe('local');
    const firstFileId = dbRow.rows[0].statement_file_id;
    expect(firstFileId).toBeTruthy();

    // 2. Reject non-PDF file (<5 bytes or missing %PDF-)
    const resBad = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: {
        cookie: lecturerA.cookie,
        'content-type': 'application/pdf',
      },
      payload: Buffer.from('NOT_A_PDF_STREAM'),
    });
    expect(resBad.statusCode).toBe(400);

    // 3. Reject file > 10 MB
    const hugePdf = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024 + 10, 'A')]);
    const resHuge = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: {
        cookie: lecturerA.cookie,
        'content-type': 'application/pdf',
      },
      payload: hugePdf,
    });
    expect([400, 413]).toContain(resHuge.statusCode);

    // 4. Reject Lecturer B (different classroom) -> 403
    const resLecB = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: {
        cookie: lecturerB.cookie,
        'content-type': 'application/pdf',
      },
      payload: validPdfBytes,
    });
    expect(resLecB.statusCode).toBe(403);

    // 5. Reject Student 1 -> 403
    const resStu = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: {
        cookie: student1.cookie,
        'content-type': 'application/pdf',
      },
      payload: validPdfBytes,
    });
    expect(resStu.statusCode).toBe(403);

    // 6. Replacing file deletes old file on storage
    const resReplace = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: {
        cookie: lecturerA.cookie,
        'content-type': 'application/pdf',
        'x-file-name': 'de_bai_v2.pdf',
      },
      payload: replacementPdfBytes,
    });
    expect(resReplace.statusCode).toBe(200);

    const dbRow2 = await pool.query('SELECT statement_file_id FROM assignments WHERE id = $1', [
      assignmentTemplateId,
    ]);
    const secondFileId = dbRow2.rows[0].statement_file_id;
    expect(secondFileId).not.toBe(firstFileId);
  });

  it('[TEST_ASSIGNMENT_STATEMENT_GET] streams PDF with exact headers and bytes to owner and enrolled student, denies outsiders', async () => {
    // 1. Lecturer A (owner) GET statement
    const resLec = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(resLec.statusCode).toBe(200);
    expect(resLec.headers['content-type']).toContain('application/pdf');
    expect(resLec.headers['content-disposition']).toContain('inline;');
    expect(resLec.headers['cache-control']).toBe('private, max-age=300');
    expect(resLec.rawPayload.equals(replacementPdfBytes)).toBe(true);

    // 2. Student 1 (enrolled in classroom A) GET statement
    const resStu1 = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: { cookie: student1.cookie },
    });
    expect(resStu1.statusCode).toBe(200);
    expect(resStu1.rawPayload.equals(replacementPdfBytes)).toBe(true);

    // 3. Lecturer B (different classroom) -> 403
    const resLecB = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: { cookie: lecturerB.cookie },
    });
    expect(resLecB.statusCode).toBe(403);

    // 4. Assignment without statement -> 404
    const resNone = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentFreeId}/statement`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(resNone.statusCode).toBe(404);
  });

  it('[TEST_ASSIGNMENT_STATEMENT_DELETE] deletes statement, resets DB columns to NULL, and removes file', async () => {
    // 1. Student cannot delete -> 403
    const resStuDel = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: { cookie: student1.cookie },
    });
    expect(resStuDel.statusCode).toBe(403);

    // 2. Lecturer B cannot delete -> 403
    const resLecBDel = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: { cookie: lecturerB.cookie },
    });
    expect(resLecBDel.statusCode).toBe(403);

    // 3. Lecturer A deletes statement -> 200
    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(resDel.statusCode).toBe(200);

    // Verify DB columns are NULL
    const dbRow = await pool.query(
      'SELECT statement_file_id, statement_storage, statement_file_name, statement_file_size FROM assignments WHERE id = $1',
      [assignmentTemplateId]
    );
    expect(dbRow.rows[0].statement_file_id).toBeNull();
    expect(dbRow.rows[0].statement_storage).toBeNull();
    expect(dbRow.rows[0].statement_file_name).toBeNull();
    expect(dbRow.rows[0].statement_file_size).toBeNull();

    // GET statement now returns 404
    const resAfter = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(resAfter.statusCode).toBe(404);

    // Re-upload a statement for subsequent tests
    await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: {
        cookie: lecturerA.cookie,
        'content-type': 'application/pdf',
        'x-file-name': 'problem.pdf',
      },
      payload: validPdfBytes,
    });
  });

  it('returns 503 "Chưa cấu hình lưu trữ đề bài PDF" when production lacks gdrive vars', async () => {
    const prodApp = buildApp({
      pool,
      config: {
        statementStorage: 'gdrive',
        gdriveClientId: '',
        nodeEnv: 'production',
        graderSecret: 'prod-secret',
        cookieSecret: 'prod-cookie-secret-32-chars-long!',
        databaseUrl: 'postgres://user:pass@remote-azure-pg.postgres.database.azure.com:5432/db',
      },
    });

    const res503 = await prodApp.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentTemplateId}/statement`,
      headers: {
        cookie: lecturerA.cookie,
        'content-type': 'application/pdf',
      },
      payload: validPdfBytes,
    });

    expect(res503.statusCode).toBe(503);
    expect(res503.json().message).toContain('Chưa cấu hình lưu trữ đề bài PDF');
    await prodApp.close();
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

  it('enforces maximum 50 hidden test cases per assignment boundary (50 accepted 201, 51st rejected 400)', async () => {
    const newAssignRes = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Assignment For 50 Tests Boundary',
        mode: 'FREE',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        entryPointSpec: {
          harness: '#include <iostream>\nint main(){ return solve(); }',
          entry: { type: 'function', name: 'solve' },
        },
      },
    });
    expect(newAssignRes.statusCode).toBe(201);
    const assignId = newAssignRes.json().assignment.id;

    for (let i = 1; i <= 50; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/assignments/${assignId}/tests`,
        headers: { cookie: lecturerA.cookie },
        payload: {
          inputData: `input_${i}\n`,
          expectedOutput: `expected_${i}\n`,
          isHidden: true,
        },
      });
      expect(res.statusCode).toBe(201);
    }

    // 51st hidden test case must be rejected
    const res51 = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignId}/tests`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        inputData: 'input_51\n',
        expectedOutput: 'expected_51\n',
        isHidden: true,
      },
    });
    expect(res51.statusCode).toBe(400);
    expect(res51.json().error).toBe('TOO_MANY_TEST_CASES');
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

  it('enforces student code 64 KB limit boundary on submission (65536 bytes accepted 201, 65537 bytes rejected 413)', async () => {
    // 1. Exactly 65536 bytes
    const base = 'int solve(int a, int b) { /* ';
    const end = ' */ return a + b; }';
    const padding = 'X'.repeat(65536 - Buffer.byteLength(base + end, 'utf8'));
    const codeExact64Kb = base + padding + end;
    expect(Buffer.byteLength(codeExact64Kb, 'utf8')).toBe(65536);

    const resOk = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/submissions`,
      headers: { cookie: student1.cookie },
      payload: {
        regions: {
          solve: codeExact64Kb,
        },
      },
    });
    expect(resOk.statusCode).toBe(201);

    // 2. 65537 bytes (1 byte over)
    const codeOver64Kb = codeExact64Kb + 'Y';
    expect(Buffer.byteLength(codeOver64Kb, 'utf8')).toBe(65537);

    const resOver = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/submissions`,
      headers: { cookie: student1.cookie },
      payload: {
        regions: {
          solve: codeOver64Kb,
        },
      },
    });
    expect(resOver.statusCode).toBe(413);
    expect(resOver.json().error).toBe('PAYLOAD_TOO_LARGE');
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
        { index: 0, verdict: 'AC', timeMs: 12, memoryKb: 1024 },
        { index: 1, verdict: 'AC', timeMs: 15, memoryKb: 1024 },
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
        tests: [{ index: 0, verdict: 'AC', timeMs: 12, memoryKb: 1024 }],
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

  it('verifies 0-based indexing with 4 hidden tests [AC, WA, TLE, AC] preserving order and 2/4 passed', async () => {
    // 1. Create assignment with 4 hidden tests
    const assignRes = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: '4-Test Assignment',
        description: 'Testing 4 test cases',
        mode: 'FREE',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        entryPointSpec: {
          harness: '#include <iostream>\nint main(){ return solve(); }',
          entry: { type: 'function', name: 'solve' },
        },
      },
    });
    const assign4Id = assignRes.json().assignment.id;

    for (let i = 1; i <= 4; i++) {
      await app.inject({
        method: 'POST',
        url: `/api/assignments/${assign4Id}/tests`,
        headers: { cookie: lecturerA.cookie },
        payload: {
          inputData: `input_${i}\n`,
          expectedOutput: `expected_${i}\n`,
          isHidden: true,
          orderIndex: i,
        },
      });
    }

    // 2. Submit solution
    const subRes = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assign4Id}/submissions`,
      headers: { cookie: student1.cookie },
      payload: {
        studentSource: 'int solve(){ return 0; }',
        entry: { type: 'function', name: 'solve' },
      },
    });
    expect(subRes.statusCode).toBe(201);
    const sub4Id = subRes.json().submission.id;

    // 3. Construct JudgeResult contract conforming to docs/GRADER.md
    const contractResult: JudgeResult = {
      submissionId: sub4Id,
      status: 'DONE',
      verdict: 'WA',
      score: 0.5,
      tests: [
        { index: 0, verdict: 'AC', timeMs: 10, memoryKb: 1024 },
        { index: 1, verdict: 'WA', timeMs: 15, memoryKb: 1024 },
        { index: 2, verdict: 'TLE', timeMs: 1005, memoryKb: 1024 },
        { index: 3, verdict: 'AC', timeMs: 12, memoryKb: 1024 },
      ],
      compileMessage: '',
    };

    const callbackRes = await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': GRADER_SECRET },
      payload: contractResult,
    });
    expect(callbackRes.statusCode).toBe(200);

    // 4. Verify 4 rows in submission_test_results in exact order
    const dbResults = await pool.query(
      `SELECT r.verdict, t.order_index
       FROM submission_test_results r
       JOIN test_cases t ON r.test_case_id = t.id
       WHERE r.submission_id = $1
       ORDER BY t.order_index ASC`,
      [sub4Id]
    );
    expect(dbResults.rows).toHaveLength(4);
    expect(dbResults.rows[0].verdict).toBe('AC');
    expect(dbResults.rows[1].verdict).toBe('WA');
    expect(dbResults.rows[2].verdict).toBe('TLE');
    expect(dbResults.rows[3].verdict).toBe('AC');

    const dbSub = await pool.query(
      'SELECT status, score, passed_tests, total_tests FROM submissions WHERE id = $1',
      [sub4Id]
    );
    expect(dbSub.rows[0].status).toBe('COMPLETED');
    expect(dbSub.rows[0].passed_tests).toBe(2);
    expect(dbSub.rows[0].total_tests).toBe(4);
    expect(Number(dbSub.rows[0].score)).toBe(0.5);

    // 5. Test out-of-bounds index rejects and sets SYSTEM_ERROR
    const subBadRes = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assign4Id}/submissions`,
      headers: { cookie: student2.cookie },
      payload: {
        studentSource: 'int solve(){ return 0; }',
        entry: { type: 'function', name: 'solve' },
      },
    });
    expect(subBadRes.statusCode).toBe(201);
    const subBadId = subBadRes.json().submission.id;

    const outOfBoundsCallback = await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': GRADER_SECRET },
      payload: {
        submissionId: subBadId,
        status: 'DONE',
        verdict: 'AC',
        score: 1.0,
        tests: [{ index: 4, verdict: 'AC', timeMs: 10, memoryKb: 1024 }], // 4 is out of bounds for 4 tests (0..3)
      },
    });
    expect(outOfBoundsCallback.statusCode).toBe(400);

    const badSubDb = await pool.query('SELECT status FROM submissions WHERE id = $1', [subBadId]);
    expect(badSubDb.rows[0].status).toBe('SYSTEM_ERROR');

    // 6. Test duplicate index rejects and sets SYSTEM_ERROR
    const subDupRes = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assign4Id}/submissions`,
      headers: { cookie: student2.cookie },
      payload: {
        studentSource: 'int solve(){ return 0; }',
        entry: { type: 'function', name: 'solve' },
      },
    });
    expect(subDupRes.statusCode).toBe(201);
    const subDupId = subDupRes.json().submission.id;

    const dupCallback = await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': GRADER_SECRET },
      payload: {
        submissionId: subDupId,
        status: 'DONE',
        verdict: 'AC',
        score: 1.0,
        tests: [
          { index: 0, verdict: 'AC', timeMs: 10, memoryKb: 1024 },
          { index: 0, verdict: 'AC', timeMs: 10, memoryKb: 1024 },
        ],
      },
    });
    expect(dupCallback.statusCode).toBe(400);

    const dupSubDb = await pool.query('SELECT status FROM submissions WHERE id = $1', [subDupId]);
    expect(dupSubDb.rows[0].status).toBe('SYSTEM_ERROR');
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

  it('[TEST_GRADES_EXPORT_CSV] verifies deadline boundary, late flag, and max score via API without direct SQL insert', async () => {
    // 1. Create assignment with fixed deadline
    const deadlineTime = new Date('2026-11-01T12:00:00.000Z');
    const assignRes = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Deadline Test Assignment',
        description: 'Testing deadline boundary',
        mode: 'FREE',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        deadline: deadlineTime.toISOString(),
        entryPointSpec: {
          harness: '#include <iostream>\nint main(){ return solve(); }',
          entry: { type: 'function', name: 'solve' },
        },
      },
    });
    expect(assignRes.statusCode).toBe(201);
    const testAssignId = assignRes.json().assignment.id;

    // Add hidden test
    await app.inject({
      method: 'POST',
      url: `/api/assignments/${testAssignId}/tests`,
      headers: { cookie: lecturerA.cookie },
      payload: { inputData: '1\n', expectedOutput: '1\n', isHidden: true },
    });

    // 2. Submit exactly at deadline (simulatedNow = deadlineTime) -> considered on-time
    simulatedNow = new Date(deadlineTime.getTime());
    const onTimeSubRes = await app.inject({
      method: 'POST',
      url: `/api/assignments/${testAssignId}/submissions`,
      headers: { cookie: student2.cookie },
      payload: {
        studentSource: 'int solve(){ return 1; }',
        entry: { type: 'function', name: 'solve' },
      },
    });
    expect(onTimeSubRes.statusCode).toBe(201);
    const onTimeSubId = onTimeSubRes.json().submission.id;
    expect(onTimeSubRes.json().submission.isLate).toBe(false);

    // Complete on-time submission with score 0.8
    await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': GRADER_SECRET },
      payload: {
        submissionId: onTimeSubId,
        status: 'DONE',
        verdict: 'AC',
        score: 0.8,
        tests: [{ index: 0, verdict: 'AC', timeMs: 10, memoryKb: 1024 }],
      },
    });

    // 3. Submit 1 ms after deadline (simulatedNow = deadlineTime + 1ms) -> considered late
    simulatedNow = new Date(deadlineTime.getTime() + 1);
    const lateSubRes = await app.inject({
      method: 'POST',
      url: `/api/assignments/${testAssignId}/submissions`,
      headers: { cookie: student2.cookie },
      payload: {
        studentSource: 'int solve(){ return 1; }',
        entry: { type: 'function', name: 'solve' },
      },
    });
    expect(lateSubRes.statusCode).toBe(201);
    const lateSubId = lateSubRes.json().submission.id;
    expect(lateSubRes.json().submission.isLate).toBe(true);

    // Complete late submission with higher score 1.0
    await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: { 'x-grader-secret': GRADER_SECRET },
      payload: {
        submissionId: lateSubId,
        status: 'DONE',
        verdict: 'AC',
        score: 1.0,
        tests: [{ index: 0, verdict: 'AC', timeMs: 10, memoryKb: 1024 }],
      },
    });

    // 4. Verify submissions list via API
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/assignments/${testAssignId}/submissions`,
      headers: { cookie: student2.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const subs = listRes.json().submissions;
    const onTimeItem = subs.find((s: any) => s.id === onTimeSubId);
    const lateItem = subs.find((s: any) => s.id === lateSubId);
    expect(onTimeItem.isLate).toBe(false);
    expect(Number(onTimeItem.score)).toBe(0.8);
    expect(lateItem.isLate).toBe(true);
    expect(Number(lateItem.score)).toBe(1.0);

    // 5. Export grades CSV
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
  // RATE LIMITING TESTS
  // ==========================================

  it('enforces login rate limit (10 attempts/min/IP allowed, 11th attempt returns 429)', async () => {
    const rateLimitIp = '192.168.100.50';
    for (let i = 1; i <= 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: rateLimitIp,
        payload: { email: 'nonexistent@example.com', password: 'wrong' },
      });
      expect(res.statusCode).toBe(401);
    }

    // 11th attempt from same IP
    const res11 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: rateLimitIp,
      payload: { email: 'nonexistent@example.com', password: 'wrong' },
    });
    expect(res11.statusCode).toBe(429);
    expect(res11.json().statusCode).toBe(429);
  });

  it('enforces submission rate limit (6 submissions/min/user allowed, 7th attempt returns 429)', async () => {
    const pwdHash = await hashPassword('Password123!');
    const rlStudentRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password)
       VALUES ('ratelimit_student@cppdsa.local', $1, 'RL Student', 'STUDENT', false) RETURNING id`,
      [pwdHash]
    );
    const rlStudentId = rlStudentRes.rows[0].id;
    await pool.query(
      `INSERT INTO classroom_enrollments (classroom_id, student_id, student_code)
       VALUES ($1, $2, 'RL001')`,
      [classroomAId, rlStudentId]
    );

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ratelimit_student@cppdsa.local', password: 'Password123!' },
    });
    const rlCookie = (loginRes.headers['set-cookie'] as string).split(';')[0];

    for (let i = 1; i <= 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/assignments/${assignmentFreeId}/submissions`,
        headers: { cookie: rlCookie },
        payload: {
          studentSource: `int solve(){ return ${i}; }`,
          entry: { type: 'function', name: 'solve' },
        },
      });
      expect(res.statusCode).toBe(201);
    }

    // 7th submission
    const res7 = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentFreeId}/submissions`,
      headers: { cookie: rlCookie },
      payload: {
        studentSource: 'int solve(){ return 7; }',
        entry: { type: 'function', name: 'solve' },
      },
    });
    expect(res7.statusCode).toBe(429);
    expect(res7.json().statusCode).toBe(429);
  });

  // ==========================================
  // T-0012: FREE MODE, SCORE UPDATE, REGRADE, BULK TESTS & WAKEUP
  // ==========================================

  it('submits FREE mode solution with only studentSource (no entry) -> 201', async () => {
    receivedGraderJobs.length = 0;
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentFreeId}/submissions`,
      headers: { cookie: student1.cookie },
      payload: {
        studentSource:
          '#include <iostream>\nint main() { std::cout << 42 << std::endl; return 0; }',
      },
    });

    expect(res.statusCode).toBe(201);
    const subId = res.json().submission.id;
    expect(subId).toBeDefined();

    expect(receivedGraderJobs).toHaveLength(1);
    expect(receivedGraderJobs[0].submissionId).toBe(subId);
    expect(receivedGraderJobs[0].mode).toBe('free');
    expect(receivedGraderJobs[0].free.studentSource).toContain('int main()');
  });

  it('[TEST_SUBMISSIONS_UPDATE_SCORE] updates submission score (GV owner 200, score bounds 400, other GV/student 403)', async () => {
    // 1. Valid update by Lecturer A (owner)
    const resOk = await app.inject({
      method: 'PATCH',
      url: `/api/submissions/${submission1Id}/score`,
      headers: { cookie: lecturerA.cookie },
      payload: { score: 0.85 },
    });
    expect(resOk.statusCode).toBe(200);
    expect(resOk.json().submission.score).toBe(0.85);

    const dbSub = await pool.query('SELECT score FROM submissions WHERE id = $1', [submission1Id]);
    expect(Number(dbSub.rows[0].score)).toBe(0.85);

    // 2. Out of bounds > 1 -> 400
    const resHigh = await app.inject({
      method: 'PATCH',
      url: `/api/submissions/${submission1Id}/score`,
      headers: { cookie: lecturerA.cookie },
      payload: { score: 1.5 },
    });
    expect(resHigh.statusCode).toBe(400);

    // 3. Out of bounds < 0 -> 400
    const resLow = await app.inject({
      method: 'PATCH',
      url: `/api/submissions/${submission1Id}/score`,
      headers: { cookie: lecturerA.cookie },
      payload: { score: -0.1 },
    });
    expect(resLow.statusCode).toBe(400);

    // 4. Other lecturer -> 403
    const resOtherLec = await app.inject({
      method: 'PATCH',
      url: `/api/submissions/${submission1Id}/score`,
      headers: { cookie: lecturerB.cookie },
      payload: { score: 0.9 },
    });
    expect(resOtherLec.statusCode).toBe(403);

    // 5. Student -> 403
    const resStudent = await app.inject({
      method: 'PATCH',
      url: `/api/submissions/${submission1Id}/score`,
      headers: { cookie: student1.cookie },
      payload: { score: 1.0 },
    });
    expect(resStudent.statusCode).toBe(403);
  });

  it('[TEST_SUBMISSIONS_REGRADE] regrades single submission (results deleted, PENDING, mock grader received job)', async () => {
    // Ensure submission has some test results
    await pool.query(
      `INSERT INTO submission_test_results (submission_id, test_case_id, verdict, execution_time_ms, memory_used_kb)
       VALUES ($1, $2, 'AC', 10, 1024)
       ON CONFLICT DO NOTHING`,
      [submission1Id, hiddenTestId]
    );

    receivedGraderJobs.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submission1Id}/regrade`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);

    // Verify test results deleted
    const countRes = await pool.query(
      'SELECT COUNT(*) FROM submission_test_results WHERE submission_id = $1',
      [submission1Id]
    );
    expect(Number(countRes.rows[0].count)).toBe(0);

    // Verify status reset to PENDING and score 0
    const subRes = await pool.query(
      'SELECT status, score, passed_tests, retry_count, compile_output FROM submissions WHERE id = $1',
      [submission1Id]
    );
    expect(subRes.rows[0].status).toBe('PENDING');
    expect(Number(subRes.rows[0].score)).toBe(0);
    expect(subRes.rows[0].passed_tests).toBe(0);
    expect(subRes.rows[0].retry_count).toBe(0);
    expect(subRes.rows[0].compile_output).toBeNull();

    // Verify grader received job
    expect(receivedGraderJobs.length).toBeGreaterThanOrEqual(1);
    expect(receivedGraderJobs[receivedGraderJobs.length - 1].submissionId).toBe(submission1Id);

    // Student -> 403
    const resStudent = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submission1Id}/regrade`,
      headers: { cookie: student1.cookie },
    });
    expect(resStudent.statusCode).toBe(403);
  });

  it('[TEST_ASSIGNMENTS_REGRADE] regrades all assignment submissions (returns queued: n)', async () => {
    receivedGraderJobs.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/regrade`,
      headers: { cookie: lecturerA.cookie },
    });
    expect(res.statusCode).toBe(200);
    const queuedCount = res.json().queued;
    expect(typeof queuedCount).toBe('number');
    expect(queuedCount).toBeGreaterThan(0);
    expect(receivedGraderJobs.length).toBe(queuedCount);

    // Student -> 403
    const resStudent = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentTemplateId}/regrade`,
      headers: { cookie: student1.cookie },
    });
    expect(resStudent.statusCode).toBe(403);
  });

  it('[TEST_CASES_BULK_CREATE] bulk imports test cases with ordering, replace, and boundaries', async () => {
    // 1. Create a dedicated assignment for bulk test cases
    const assignRes = await app.inject({
      method: 'POST',
      url: `/api/classrooms/${classroomAId}/assignments`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        title: 'Bulk Test Assignment',
        mode: 'FREE',
        deadline: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    const bulkAssignId = assignRes.json().assignment.id;

    // 2. Add 3 tests in bulk -> order 1, 2, 3
    const res3 = await app.inject({
      method: 'POST',
      url: `/api/assignments/${bulkAssignId}/tests/bulk`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        tests: [
          { inputData: 'in1', expectedOutput: 'out1' },
          { inputData: 'in2', expectedOutput: 'out2' },
          { inputData: 'in3', expectedOutput: 'out3' },
        ],
      },
    });
    expect(res3.statusCode).toBe(201);
    expect(res3.json().count).toBe(3);

    const testsInDb = await pool.query(
      'SELECT order_index FROM test_cases WHERE assignment_id = $1 ORDER BY order_index ASC',
      [bulkAssignId]
    );
    expect(testsInDb.rows.map((r: any) => r.order_index)).toEqual([1, 2, 3]);

    // 3. Add 2 more tests without replace -> order 4, 5
    const res2More = await app.inject({
      method: 'POST',
      url: `/api/assignments/${bulkAssignId}/tests/bulk`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        tests: [
          { inputData: 'in4', expectedOutput: 'out4' },
          { inputData: 'in5', expectedOutput: 'out5' },
        ],
      },
    });
    expect(res2More.statusCode).toBe(201);
    expect(res2More.json().count).toBe(2);

    const tests5InDb = await pool.query(
      'SELECT order_index FROM test_cases WHERE assignment_id = $1 ORDER BY order_index ASC',
      [bulkAssignId]
    );
    expect(tests5InDb.rows.map((r: any) => r.order_index)).toEqual([1, 2, 3, 4, 5]);

    // 4. replace=true replaces all tests
    const resReplace = await app.inject({
      method: 'POST',
      url: `/api/assignments/${bulkAssignId}/tests/bulk`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        replace: true,
        tests: [
          { inputData: 'rep1', expectedOutput: 'repOut1' },
          { inputData: 'rep2', expectedOutput: 'repOut2' },
        ],
      },
    });
    expect(resReplace.statusCode).toBe(201);
    expect(resReplace.json().count).toBe(2);

    const testsReplacedInDb = await pool.query(
      'SELECT order_index FROM test_cases WHERE assignment_id = $1 ORDER BY order_index ASC',
      [bulkAssignId]
    );
    expect(testsReplacedInDb.rows.map((r: any) => r.order_index)).toEqual([1, 2]);

    // 5. Exceeding 50 test cases -> 400 and count unchanged
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      inputData: `in_${i}`,
      expectedOutput: `out_${i}`,
    }));
    const resTooMany = await app.inject({
      method: 'POST',
      url: `/api/assignments/${bulkAssignId}/tests/bulk`,
      headers: { cookie: lecturerA.cookie },
      payload: { replace: true, tests: tooMany },
    });
    expect(resTooMany.statusCode).toBe(400);

    const countAfterTooMany = await pool.query(
      'SELECT COUNT(*) FROM test_cases WHERE assignment_id = $1',
      [bulkAssignId]
    );
    expect(Number(countAfterTooMany.rows[0].count)).toBe(2);

    // 6. Test item exceeding MAX_TEST_CASE_BYTES (1 MB) -> 400 and nothing added
    const hugeInput = 'A'.repeat(1024 * 1024 + 1);
    const resHuge = await app.inject({
      method: 'POST',
      url: `/api/assignments/${bulkAssignId}/tests/bulk`,
      headers: { cookie: lecturerA.cookie },
      payload: {
        tests: [{ inputData: hugeInput, expectedOutput: 'valid' }],
      },
    });
    expect(resHuge.statusCode).toBe(400);

    const countAfterHuge = await pool.query(
      'SELECT COUNT(*) FROM test_cases WHERE assignment_id = $1',
      [bulkAssignId]
    );
    expect(Number(countAfterHuge.rows[0].count)).toBe(2);

    // 7. Student -> 403
    const resStudent = await app.inject({
      method: 'POST',
      url: `/api/assignments/${bulkAssignId}/tests/bulk`,
      headers: { cookie: student1.cookie },
      payload: { tests: [{ inputData: '1', expectedOutput: '1' }] },
    });
    expect(resStudent.statusCode).toBe(403);
  });

  it('calls GRADER_URL/health on successful login and does not block when grader fails', async () => {
    const hitsBefore = mockGraderHealthHits;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: lecturerA.email, password: 'Password123!' },
    });
    expect(res.statusCode).toBe(200);

    // Allow background fire-and-forget fetch to complete
    await new Promise((r) => setTimeout(r, 100));
    expect(mockGraderHealthHits).toBeGreaterThan(hitsBefore);

    // Test with invalid/failing grader URL to verify it doesn't block response
    const failingApp = buildApp({
      pool,
      config: { graderUrl: 'http://127.0.0.1:59999' },
    });
    const resFail = await failingApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: lecturerA.email, password: 'Password123!' },
    });
    expect(resFail.statusCode).toBe(200);
    expect(resFail.json().user.email).toBe(lecturerA.email);
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
