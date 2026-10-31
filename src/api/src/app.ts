import Fastify, { FastifyInstance } from 'fastify';
import pg from 'pg';

export interface AppOptions {
  pool?: pg.Pool | { query: (sql: string) => Promise<unknown> };
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  const pool = options.pool;

  app.get('/health', async (_request, reply) => {
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
  });

  return app;
}
