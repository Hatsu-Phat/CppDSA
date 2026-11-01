import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../src/app';
import { buildConfig } from '../src/config';
import { resetEmailLoginAttemptsForTest } from '../src/routes/auth';
import { escapeCsvField, generateGradesCsv } from '../src/utils/csv';
import { hashToken } from '../src/utils/security';

describe('Deploy Fixes Tests (T-0011)', () => {
  const VALID_CLASSROOM_ID = '11111111-1111-4111-8111-111111111111';
  const VALID_ASSIGNMENT_ID = '22222222-2222-4222-8222-222222222222';
  const VALID_LECTURER_ID = '44444444-4444-4444-8444-444444444444';

  let mockPool: any;

  beforeEach(() => {
    resetEmailLoginAttemptsForTest();
    delete process.env.LOGIN_RATE_LIMIT_MAX;
    delete process.env.LOGIN_IP_RATE_LIMIT_MAX;
    delete process.env.GLOBAL_RATE_LIMIT_MAX;

    mockPool = {
      query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        // Mock session resolution
        if (sql.includes('FROM sessions s') && sql.includes('JOIN users u')) {
          const tokenHash = params?.[0];
          if (tokenHash === hashToken('lecturer-session-token')) {
            return {
              rowCount: 1,
              rows: [
                {
                  session_id: 's-lec',
                  expires_at: new Date(Date.now() + 3600000),
                  id: VALID_LECTURER_ID,
                  email: 'lecturer@cppdsa.local',
                  full_name: 'Lecturer',
                  role: 'LECTURER',
                  must_change_password: false,
                },
              ],
            };
          }
          if (tokenHash === hashToken('student-a-token')) {
            return {
              rowCount: 1,
              rows: [
                {
                  session_id: 's-stu-a',
                  expires_at: new Date(Date.now() + 3600000),
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  email: 'studentA@cppdsa.local',
                  full_name: 'Student A',
                  role: 'STUDENT',
                  must_change_password: false,
                },
              ],
            };
          }
          if (tokenHash === hashToken('student-b-token')) {
            return {
              rowCount: 1,
              rows: [
                {
                  session_id: 's-stu-b',
                  expires_at: new Date(Date.now() + 3600000),
                  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  email: 'studentB@cppdsa.local',
                  full_name: 'Student B',
                  role: 'STUDENT',
                  must_change_password: false,
                },
              ],
            };
          }
          return { rowCount: 0, rows: [] };
        }

        // Mock classroom ownership
        if (sql.includes('SELECT lecturer_id FROM classrooms WHERE id = $1')) {
          if (params?.[0] === VALID_CLASSROOM_ID) {
            return { rowCount: 1, rows: [{ lecturer_id: VALID_LECTURER_ID }] };
          }
          return { rowCount: 0, rows: [] };
        }

        // Mock assignment access
        if (sql.includes('FROM assignments a') && sql.includes('JOIN classrooms c')) {
          if (params?.[0] === VALID_ASSIGNMENT_ID) {
            return {
              rowCount: 1,
              rows: [
                {
                  id: VALID_ASSIGNMENT_ID,
                  classroom_id: VALID_CLASSROOM_ID,
                  lecturer_id: VALID_LECTURER_ID,
                  title: 'Sample Assignment',
                  description: 'Desc',
                  mode: 'FREE',
                  time_limit_ms: 1000,
                  memory_limit_mb: 256,
                  deadline: new Date(Date.now() + 86400000),
                  template_code: null,
                  entry_point_spec: null,
                },
              ],
            };
          }
          return { rowCount: 0, rows: [] };
        }

        // Mock insert / update assignment
        if (sql.includes('INSERT INTO assignments')) {
          return {
            rowCount: 1,
            rows: [
              {
                id: VALID_ASSIGNMENT_ID,
                classroom_id: params?.[0],
                title: params?.[1],
                mode: params?.[3],
                time_limit_ms: params?.[4],
                memory_limit_mb: params?.[5],
              },
            ],
          };
        }
        if (sql.includes('UPDATE assignments')) {
          return {
            rowCount: 1,
            rows: [
              {
                id: params?.[7],
                title: params?.[0],
                time_limit_ms: params?.[2],
                memory_limit_mb: params?.[3],
              },
            ],
          };
        }

        // Default fallback
        return { rowCount: 0, rows: [] };
      }),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
        release: vi.fn(),
      }),
    };
  });

  // ==========================================
  // 1. RATE LIMIT TESTS
  // ==========================================
  describe('Rate Limiting', () => {
    it('(a) 11 failed logins with SAME email -> 11th attempt is 429', async () => {
      const app = buildApp({ pool: mockPool });
      const targetEmail = 'target-user@cppdsa.local';

      for (let i = 1; i <= 10; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: targetEmail, password: 'wrong-password' },
        });
        expect(res.statusCode).toBe(401);
      }

      // 11th attempt for the same email
      const res11 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: targetEmail, password: 'wrong-password' },
      });
      expect(res11.statusCode).toBe(429);
      expect(res11.json().statusCode).toBe(429);
      expect(res11.json().message).toContain('Đăng nhập quá 10 lần trong 1 phút');
    });

    it('(b) 12 different emails from the same IP (1 attempt each) -> NOT 429', async () => {
      const app = buildApp({ pool: mockPool });
      const sharedIp = '198.51.100.22';

      for (let i = 1; i <= 12; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          remoteAddress: sharedIp,
          payload: { email: `student${i}@cppdsa.local`, password: 'wrong-password' },
        });
        expect(res.statusCode).toBe(401);
      }
    });

    it('(c) with TRUST_PROXY=1 and different X-Forwarded-For, failed login for email X does not block email Y', async () => {
      const app = buildApp({
        pool: mockPool,
        config: { trustProxy: 1 },
      });

      // Email X fails 10 times from proxy client IP 203.0.113.1
      for (let i = 1; i <= 10; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { 'x-forwarded-for': '203.0.113.1' },
          payload: { email: 'userX@cppdsa.local', password: 'wrong-password' },
        });
        expect(res.statusCode).toBe(401);
      }

      // 11th attempt for email X is 429
      const resX11 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-forwarded-for': '203.0.113.1' },
        payload: { email: 'userX@cppdsa.local', password: 'wrong-password' },
      });
      expect(resX11.statusCode).toBe(429);

      // Email Y from proxy client IP 203.0.113.2 should NOT be blocked (returns 401, not 429)
      const resY = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-forwarded-for': '203.0.113.2' },
        payload: { email: 'userY@cppdsa.local', password: 'wrong-password' },
      });
      expect(resY.statusCode).toBe(401);
    });

    it('(d) global rate limit per user: user A exceeding limit gets 429, user B from same IP gets 200', async () => {
      process.env.GLOBAL_RATE_LIMIT_MAX = '5';
      const app = buildApp({ pool: mockPool });
      const commonIp = '192.168.1.100';

      // User A makes 5 requests -> 200
      for (let i = 1; i <= 5; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          remoteAddress: commonIp,
          cookies: { sid: 'student-a-token' },
        });
        expect(res.statusCode).toBe(200);
      }

      // 6th request by User A -> 429
      const resA6 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        remoteAddress: commonIp,
        cookies: { sid: 'student-a-token' },
      });
      expect(resA6.statusCode).toBe(429);
      expect(resA6.json().message).toContain('Quá nhiều yêu cầu');

      // User B from the SAME IP makes a request -> 200 OK
      const resB = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        remoteAddress: commonIp,
        cookies: { sid: 'student-b-token' },
      });
      expect(resB.statusCode).toBe(200);
      expect(resB.json().user.email).toBe('studentB@cppdsa.local');
    });
  });

  // ==========================================
  // 2. CSV FORMULA INJECTION TESTS
  // ==========================================
  describe('CSV Formula Injection Prevention', () => {
    it('prepends single quote to cells beginning with =, +, -, @, tab, or CR', () => {
      expect(escapeCsvField('=HYPERLINK("http://evil.com")')).toBe(
        `"'=HYPERLINK(""http://evil.com"")"`
      );
      expect(escapeCsvField('+1')).toBe("'+1");
      expect(escapeCsvField('-1')).toBe("'-1");
      expect(escapeCsvField('@a')).toBe("'@a");
      expect(escapeCsvField('\tcmd')).toBe("'\tcmd");
      expect(escapeCsvField('\rcalc')).toBe(`"'\rcalc"`);

      // Normal text should not have leading quote
      expect(escapeCsvField('Nguyen Van A')).toBe('Nguyen Van A');
      expect(escapeCsvField('Nguyen, Van A')).toBe('"Nguyen, Van A"');
    });

    it('generates CSV with formula injection mitigation in grade export', () => {
      const csv = generateGradesCsv([
        {
          studentCode: '=HYPERLINK("x")',
          fullName: '+1',
          email: '-1',
          assignmentTitle: '@a',
          score: 1.0,
          isLate: false,
        },
      ]);

      const lines = csv.split('\n');
      expect(lines.length).toBe(2);
      expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
      expect(lines[1]).toContain("'+1");
      expect(lines[1]).toContain("'-1");
      expect(lines[1]).toContain("'@a");
    });
  });

  // ==========================================
  // 3. UUID VALIDATION & ERROR HANDLER TESTS
  // ==========================================
  describe('UUID Parameter Validation', () => {
    it('returns 400 with Vietnamese error message for invalid UUID in GET /submissions/abc, /assignments/abc, /classrooms/abc, PUT /tests/abc', async () => {
      const app = buildApp({ pool: mockPool });

      const targets = [
        { method: 'GET' as const, url: '/api/submissions/abc' },
        { method: 'GET' as const, url: '/api/assignments/abc' },
        { method: 'GET' as const, url: '/api/classrooms/abc' },
        { method: 'PUT' as const, url: '/api/tests/abc' },
      ];

      for (const target of targets) {
        const res = await app.inject({
          method: target.method,
          url: target.url,
        });

        expect(res.statusCode).toBe(400);
        const json = res.json();
        expect(json.error).toBe('BAD_REQUEST');
        expect(json.message).toBe('Mã không hợp lệ');

        // Body must NOT leak PostgreSQL 22P02 or internal syntax errors
        expect(res.body).not.toContain('22P02');
        expect(res.body).not.toContain('invalid input syntax');
      }
    });

    it('global error handler prevents 5xx errors from leaking PostgreSQL error codes or internals', async () => {
      const app = buildApp({ pool: mockPool });
      app.get('/api/test-db-error', async () => {
        const pgError: any = new Error('invalid input syntax for type uuid: "abc"');
        pgError.code = '22P02';
        throw pgError;
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/test-db-error',
      });

      expect(res.statusCode).toBe(500);
      const json = res.json();
      expect(json.error).toBe('INTERNAL_SERVER_ERROR');
      expect(json.message).toBe('Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.');
      expect(res.body).not.toContain('22P02');
      expect(res.body).not.toContain('invalid input syntax');
    });
  });

  // ==========================================
  // 4. BOUNDS VALIDATION (timeLimitMs / memoryLimitMb)
  // ==========================================
  describe('Assignment Bounds Validation', () => {
    it('returns 400 for boundary values of timeLimitMs (-1, 0, 99, 10001) and memoryLimitMb (0, 15, 513, 999999) on POST', async () => {
      const app = buildApp({ pool: mockPool });

      // Invalid timeLimitMs
      const invalidTimeLimits = [-1, 0, 99, 10001];
      for (const tl of invalidTimeLimits) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/classrooms/${VALID_CLASSROOM_ID}/assignments`,
          cookies: { sid: 'lecturer-session-token' },
          payload: {
            title: 'Test Assignment',
            mode: 'FREE',
            deadline: new Date(Date.now() + 86400000).toISOString(),
            timeLimitMs: tl,
            memoryLimitMb: 256,
            entryPointSpec: { harness: '// harness', entry: { type: 'function', name: 'solve' } },
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain('timeLimitMs');
      }

      // Invalid memoryLimitMb
      const invalidMemoryLimits = [0, 15, 513, 999999];
      for (const ml of invalidMemoryLimits) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/classrooms/${VALID_CLASSROOM_ID}/assignments`,
          cookies: { sid: 'lecturer-session-token' },
          payload: {
            title: 'Test Assignment',
            mode: 'FREE',
            deadline: new Date(Date.now() + 86400000).toISOString(),
            timeLimitMs: 1000,
            memoryLimitMb: ml,
            entryPointSpec: { harness: '// harness', entry: { type: 'function', name: 'solve' } },
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain('memoryLimitMb');
      }
    });

    it('accepts boundary values 100/10000 ms and 16/512 MB returning 201 on POST', async () => {
      const app = buildApp({ pool: mockPool });

      const resMin = await app.inject({
        method: 'POST',
        url: `/api/classrooms/${VALID_CLASSROOM_ID}/assignments`,
        cookies: { sid: 'lecturer-session-token' },
        payload: {
          title: 'Min Boundary Assignment',
          mode: 'FREE',
          deadline: new Date(Date.now() + 86400000).toISOString(),
          timeLimitMs: 100,
          memoryLimitMb: 16,
          entryPointSpec: { harness: '// harness', entry: { type: 'function', name: 'solve' } },
        },
      });
      expect(resMin.statusCode).toBe(201);

      const resMax = await app.inject({
        method: 'POST',
        url: `/api/classrooms/${VALID_CLASSROOM_ID}/assignments`,
        cookies: { sid: 'lecturer-session-token' },
        payload: {
          title: 'Max Boundary Assignment',
          mode: 'FREE',
          deadline: new Date(Date.now() + 86400000).toISOString(),
          timeLimitMs: 10000,
          memoryLimitMb: 512,
          entryPointSpec: { harness: '// harness', entry: { type: 'function', name: 'solve' } },
        },
      });
      expect(resMax.statusCode).toBe(201);
    });

    it('enforces boundary validation on PUT /assignments/:id', async () => {
      const app = buildApp({ pool: mockPool });

      const res1 = await app.inject({
        method: 'PUT',
        url: `/api/assignments/${VALID_ASSIGNMENT_ID}`,
        cookies: { sid: 'lecturer-session-token' },
        payload: { timeLimitMs: 99 },
      });
      expect(res1.statusCode).toBe(400);

      const res2 = await app.inject({
        method: 'PUT',
        url: `/api/assignments/${VALID_ASSIGNMENT_ID}`,
        cookies: { sid: 'lecturer-session-token' },
        payload: { memoryLimitMb: 513 },
      });
      expect(res2.statusCode).toBe(400);
    });
  });

  // ==========================================
  // 5. PRODUCTION GUARD TESTS
  // ==========================================
  describe('Production Guard', () => {
    it('throws clear error when NODE_ENV=production lacks GRADER_SECRET', () => {
      expect(() =>
        buildConfig({
          nodeEnv: 'production',
          graderSecret: '',
          cookieSecret: 'prod-cookie-secret-key-32-chars-long!',
          databaseUrl: 'postgres://user:pass@remote-azure-pg.postgres.database.azure.com:5432/db',
        })
      ).toThrow('GRADER_SECRET không được để trống khi NODE_ENV=production');
    });

    it('throws clear error when NODE_ENV=production lacks or uses default COOKIE_SECRET', () => {
      expect(() =>
        buildConfig({
          nodeEnv: 'production',
          graderSecret: 'prod-grader-secret',
          cookieSecret: '',
          databaseUrl: 'postgres://user:pass@remote-azure-pg.postgres.database.azure.com:5432/db',
        })
      ).toThrow('COOKIE_SECRET không được để trống');

      expect(() =>
        buildConfig({
          nodeEnv: 'production',
          graderSecret: 'prod-grader-secret',
          cookieSecret: 'dev-cookie-secret-32-characters-minimum-key!',
          databaseUrl: 'postgres://user:pass@remote-azure-pg.postgres.database.azure.com:5432/db',
        })
      ).toThrow('COOKIE_SECRET không được để trống hoặc dùng giá trị mặc định');
    });

    it('throws clear error when NODE_ENV=production DATABASE_URL points to localhost', () => {
      expect(() =>
        buildConfig({
          nodeEnv: 'production',
          graderSecret: 'prod-grader-secret',
          cookieSecret: 'prod-cookie-secret-key-32-chars-long!',
          databaseUrl: 'postgres://user:pass@localhost:5432/db',
        })
      ).toThrow('DATABASE_URL không được trỏ về localhost khi NODE_ENV=production');

      expect(() =>
        buildConfig({
          nodeEnv: 'production',
          graderSecret: 'prod-grader-secret',
          cookieSecret: 'prod-cookie-secret-key-32-chars-long!',
          databaseUrl: 'postgres://user:pass@127.0.0.1:5432/db',
        })
      ).toThrow('DATABASE_URL không được trỏ về localhost khi NODE_ENV=production');
    });

    it('succeeds when all production requirements are satisfied', () => {
      const cfg = buildConfig({
        nodeEnv: 'production',
        graderSecret: 'prod-grader-secret',
        cookieSecret: 'prod-cookie-secret-key-32-chars-long!',
        databaseUrl: 'postgres://user:pass@remote-azure-pg.postgres.database.azure.com:5432/db',
      });
      expect(cfg.nodeEnv).toBe('production');
      expect(cfg.graderSecret).toBe('prod-grader-secret');
    });
  });
});
