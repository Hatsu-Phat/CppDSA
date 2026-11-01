import { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { ApiConfig } from '../config.js';

export interface SystemRouteOptions {
  pool: pg.Pool;
  config: ApiConfig;
}

export const systemRoutes: FastifyPluginAsync<SystemRouteOptions> = async (app, options) => {
  const { pool, config } = options;

  // POST /api/system/warmup (Lecturer only - US-07)
  app.post('/warmup', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền khởi động hệ thống' });
    }

    let dbStatus: 'ok' | 'error' = 'error';
    let graderStatus: 'ok' | 'error' = 'error';

    // 1. Check DB
    try {
      await pool.query('SELECT 1');
      dbStatus = 'ok';
    } catch {
      dbStatus = 'error';
    }

    // 2. Check Grader
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${config.graderUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        graderStatus = 'ok';
      }
    } catch {
      graderStatus = 'error';
    }

    let overallStatus: 'ok' | 'partial' | 'error' = 'ok';
    if (dbStatus === 'ok' && graderStatus === 'ok') {
      overallStatus = 'ok';
    } else if (dbStatus === 'error' && graderStatus === 'error') {
      overallStatus = 'error';
    } else {
      overallStatus = 'partial';
    }

    return reply.code(200).send({
      status: overallStatus,
      db: dbStatus,
      grader: graderStatus,
    });
  });
};
