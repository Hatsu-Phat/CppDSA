import Fastify, { FastifyInstance } from 'fastify';

export function buildGraderApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.get('/health', async (_request, reply) => {
    return reply.code(200).send({ status: 'ok' });
  });

  return app;
}
