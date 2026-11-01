import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import pg from 'pg';
import { ApiConfig, config as defaultConfig } from './config.js';
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
  const cfg: ApiConfig = {
    ...defaultConfig,
    ...options.config,
    now: options.now || options.config?.now || defaultConfig.now,
  };
  const pool = options.pool || new pg.Pool({ connectionString: cfg.databaseUrl, max: 5 });

  const app = Fastify({
    logger: cfg.nodeEnv !== 'test',
    bodyLimit: 10 * 1024 * 1024,
  });

  // 1. Plugins
  app.register(fastifyCookie, {
    secret: cfg.cookieSecret,
  });

  app.register(fastifyRateLimit, {
    global: false,
    hook: 'preHandler',
  });

  // 2. Authentication hook (runs on every request)
  app.addHook('preHandler', async (request) => {
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
  app.get('/api/health', handleHealth);

  // 6. Register routes with /api prefix
  app.register(
    async (api) => {
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
