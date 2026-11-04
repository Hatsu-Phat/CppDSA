import fs from 'node:fs';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import pg from 'pg';
import { ApiConfig, buildConfig, config as defaultConfig } from './config.js';
import { hashToken } from './utils/security.js';
import { runRecovery } from './services/recovery.js';
import { authRoutes } from './routes/auth.js';
import { classroomRoutes } from './routes/classrooms.js';
import { assignmentRoutes } from './routes/assignments.js';
import { testCaseRoutes } from './routes/test-cases.js';
import { submissionRoutes } from './routes/submissions.js';
import { gradeRoutes } from './routes/grades.js';
import { systemRoutes } from './routes/system.js';
import { internalRoutes } from './routes/internal.js';
import { RequestUser } from './types/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: RequestUser;
    sessionId?: string;
  }
}

export interface AppOptions {
  pool?: pg.Pool | any;
  config?: Partial<ApiConfig>;
  now?: () => Date;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const cfg: ApiConfig = buildConfig({
    ...defaultConfig,
    ...options.config,
    nodeEnv:
      options.config?.nodeEnv ||
      (process.env.NODE_ENV === 'test' ? 'test' : options.config?.nodeEnv),
    now: options.now || options.config?.now || defaultConfig.now,
  });
  const pool = options.pool || new pg.Pool({ connectionString: cfg.databaseUrl, max: 5 });

  // Structured logging with pino and strict credential/code redaction
  const app = Fastify({
    trustProxy: cfg.trustProxy as any,
    logger:
      cfg.nodeEnv !== 'test'
        ? {
            level: 'info',
            redact: {
              paths: [
                'req.headers.cookie',
                'req.headers["x-grader-secret"]',
                'req.headers.authorization',
                'password',
                'newPassword',
                'oldPassword',
                'token',
                'graderSecret',
                'databaseUrl',
                'DATABASE_URL',
                'submittedCode',
                'studentSource',
                'input',
                'expected',
                'actual',
              ],
              censor: '[REDACTED]',
            },
          }
        : false,
    bodyLimit: 10 * 1024 * 1024,
  });

  // Global error handler: ensure 5xx errors never leak PostgreSQL codes or internals
  app.setErrorHandler((error: any, request, reply) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      request.log.error(error);
      return reply.code(500).send({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      });
    }

    return reply.status(statusCode).send(error);
  });

  // 1. Plugins
  app.register(fastifyCookie, {
    secret: cfg.cookieSecret,
  });

  // Content type parser for raw PDF uploads
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  // UUID validation hook: any path param :id or :studentId must be valid UUID before DB queries
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  app.addHook('preValidation', async (request, reply) => {
    const params = request.params as Record<string, string> | undefined;
    if (params && typeof params === 'object') {
      if (params.id !== undefined && !UUID_REGEX.test(params.id)) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'Mã không hợp lệ',
        });
      }
      if (params.studentId !== undefined && !UUID_REGEX.test(params.studentId)) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'Mã không hợp lệ',
        });
      }
    }
  });

  // 2. Authentication hook (runs on every request in preValidation, before preHandler rate limits)
  app.addHook('preValidation', async (request) => {
    request.user = undefined;
    request.sessionId = undefined;

    const rawSid = request.cookies.sid;
    if (!rawSid) {
      return;
    }

    try {
      const tokenHash = hashToken(rawSid);
      const res = await pool.query(
        `SELECT s.id as session_id, s.expires_at, u.id, u.email, u.full_name, u.role, u.must_change_password
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token_hash = $1`,
        [tokenHash]
      );

      if (res.rowCount! > 0) {
        const row = res.rows[0];
        if (new Date(row.expires_at).getTime() > Date.now()) {
          request.user = {
            id: row.id,
            email: row.email,
            fullName: row.full_name,
            role: row.role,
            mustChangePassword: row.must_change_password,
          };
          request.sessionId = row.session_id;
        }
      }
    } catch {
      // In case of DB read error, request remains unauthenticated
    }
  });

  app.register(fastifyRateLimit, {
    global: true,
    max: () => Number(process.env.GLOBAL_RATE_LIMIT_MAX || cfg.globalRateLimitMax || 300),
    timeWindow: 60 * 1000,
    hook: 'preHandler',
    keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`),
    allowList: (req) => {
      const url = req.url.split('?')[0];
      return url === '/health';
    },
    errorResponseBuilder: (req) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: req.user
        ? 'Quá nhiều yêu cầu từ tài khoản của bạn. Vui lòng thử lại sau.'
        : 'Quá nhiều yêu cầu từ địa chỉ IP của bạn. Vui lòng thử lại sau.',
    }),
  });

  // Optional cgroup resource logging every 10s if enabled
  if (process.env.ENABLE_CGROUP_LOGGING === 'true') {
    setInterval(() => {
      try {
        let cpuStat = '';
        let memCurrent = '';
        let memPeak = '';
        if (fs.existsSync('/sys/fs/cgroup/cpu.stat')) {
          cpuStat = fs.readFileSync('/sys/fs/cgroup/cpu.stat', 'utf-8').trim();
        }
        if (fs.existsSync('/sys/fs/cgroup/memory.current')) {
          memCurrent = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf-8').trim();
        }
        if (fs.existsSync('/sys/fs/cgroup/memory.peak')) {
          memPeak = fs.readFileSync('/sys/fs/cgroup/memory.peak', 'utf-8').trim();
        }
        console.log(
          JSON.stringify({
            level: 'info',
            time: new Date().toISOString(),
            service: 'api-cgroup',
            cpuStat,
            memoryCurrentBytes: Number(memCurrent) || null,
            memoryPeakBytes: Number(memPeak) || null,
          })
        );
      } catch {
        // Ignore
      }
    }, 10000);
  }

  // 3. Password change enforcement hook
  app.addHook('preHandler', async (request, reply) => {
    if (!request.user || !request.user.mustChangePassword) {
      return;
    }

    // Allowed exceptions: me, change-password, logout, health, login, grader-callback
    const path = request.url.split('?')[0];
    const isAllowed =
      path === '/health' ||
      path === '/api/health' ||
      path === '/api/auth/login' ||
      path === '/api/auth/logout' ||
      path === '/api/auth/me' ||
      path === '/api/auth/change-password' ||
      path === '/api/internal/grader-callback';

    if (!isAllowed) {
      return reply.code(403).send({
        error: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Bạn phải đổi mật khẩu trước khi tiếp tục',
      });
    }
  });

  // 4. On-response hook: trigger recovery step without blocking response
  app.addHook('onResponse', (_request, _reply, done) => {
    // Non-blocking background recovery step
    void runRecovery({
      pool,
      graderUrl: cfg.graderUrl,
      graderSecret: cfg.graderSecret,
      apiBaseUrl: cfg.apiBaseUrl,
    }).catch((err) => {
      app.log.error(err, 'Error running recovery in onResponse hook');
    });
    done();
  });

  // 5. Healthcheck routes
  const handleHealth = async (_request: any, reply: any) => {
    let dbStatus = 'ok';
    if (pool) {
      try {
        await pool.query('SELECT 1');
        dbStatus = 'ok';
      } catch (err) {
        app.log.error(err, 'Database connection healthcheck failed');
        return reply.code(503).send({ status: 'error', db: 'error' });
      }
    }
    return reply.code(200).send({ status: 'ok', db: dbStatus });
  };

  app.get('/health', handleHealth);

  // 6. Register routes with /api prefix
  app.register(
    async (api) => {
      api.get('/health', handleHealth);
      api.register(authRoutes, { prefix: '/auth', pool, config: cfg });
      api.register(classroomRoutes, { prefix: '/classrooms', pool, config: cfg });
      api.register(assignmentRoutes, { pool, config: cfg });
      api.register(testCaseRoutes, { pool, config: cfg });
      api.register(submissionRoutes, { pool, config: cfg });
      api.register(gradeRoutes, { pool, config: cfg });
      api.register(systemRoutes, { prefix: '/system', pool, config: cfg });
      api.register(internalRoutes, { prefix: '/internal', pool, config: cfg });
    },
    { prefix: '/api' }
  );

  return app;
}
