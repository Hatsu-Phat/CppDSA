import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { JudgeJob, validateTemplateRegions, validateFreeModeSpec } from '@cppdsa/shared';
import { GraderConfig, loadConfig } from './config.js';
import { JobQueue } from './queue.js';

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function buildGraderApp(
  customConfig?: Partial<GraderConfig>,
  customQueue?: JobQueue
): FastifyInstance {
  const config: GraderConfig = {
    ...loadConfig(),
    ...customConfig,
  };

  const jobQueue = customQueue || new JobQueue(config);

  const app = Fastify({
    logger: false,
  });

  // Health check endpoint
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = jobQueue.getStats();
    return reply.code(200).send({
      status: 'ok',
      queueLength: stats.queueLength,
      activeJobs: stats.activeJobs,
      activeMemoryMb: stats.activeMemoryMb,
      memoryBudgetMb: stats.memoryBudgetMb,
    });
  });

  // Internal metrics endpoint for load test latency breakdown
  app.get('/jobs/:submissionId/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const { submissionId } = request.params as { submissionId: string };
    const metrics = jobQueue.getJobMetrics(submissionId);
    if (!metrics) {
      return reply.code(404).send({ error: 'Metrics not found' });
    }
    return reply.code(200).send(metrics);
  });

  // Submit job endpoint
  app.post('/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Secret authentication
    if (!config.graderSecret) {
      return reply.code(503).send({ error: 'Grader secret not configured' });
    }

    const secretHeader = request.headers['x-grader-secret'];
    if (
      !secretHeader ||
      typeof secretHeader !== 'string' ||
      !constantTimeEqual(secretHeader, config.graderSecret)
    ) {
      return reply.code(401).send({ error: 'Unauthorized: invalid or missing X-Grader-Secret' });
    }

    // 2. Validate payload
    const body = request.body as Partial<JudgeJob>;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'Invalid JSON request body' });
    }

    if (!body.submissionId || typeof body.submissionId !== 'string') {
      return reply.code(400).send({ error: 'Missing or invalid submissionId' });
    }

    if (body.language !== 'cpp17') {
      return reply.code(400).send({ error: "Language must be 'cpp17'" });
    }

    if (body.compare !== 'trim-trailing') {
      return reply.code(400).send({ error: "Compare must be 'trim-trailing'" });
    }

    if (typeof body.timeLimitMs !== 'number' || body.timeLimitMs <= 0) {
      return reply.code(400).send({ error: 'timeLimitMs must be a positive number' });
    }

    if (typeof body.memoryLimitMb !== 'number' || body.memoryLimitMb <= 0) {
      return reply.code(400).send({ error: 'memoryLimitMb must be a positive number' });
    }

    if (body.memoryLimitMb > config.memoryBudgetMb) {
      return reply.code(400).send({
        error: `memoryLimitMb (${body.memoryLimitMb}) exceeds grader memory budget (${config.memoryBudgetMb})`,
      });
    }

    if (!Array.isArray(body.hiddenTests) || body.hiddenTests.length === 0) {
      return reply.code(400).send({ error: 'hiddenTests must be a non-empty array' });
    }

    if (!body.callbackUrl || typeof body.callbackUrl !== 'string') {
      return reply.code(400).send({ error: 'callbackUrl is required' });
    }

    if (body.mode === 'template') {
      if (!body.template || typeof body.template !== 'object') {
        return reply.code(400).send({ error: 'template spec is required for template mode' });
      }
      const val = validateTemplateRegions(body.template.source, body.template.regions);
      if (!val.valid) {
        return reply.code(400).send({ error: val.error });
      }
    } else if (body.mode === 'free') {
      if (!body.free || typeof body.free !== 'object') {
        return reply.code(400).send({ error: 'free spec is required for free mode' });
      }
      const val = validateFreeModeSpec(body.free);
      if (!val.valid) {
        return reply.code(400).send({ error: val.error });
      }
    } else {
      return reply.code(400).send({ error: "mode must be either 'template' or 'free'" });
    }

    // 3. Enqueue job
    const job = body as JudgeJob;
    jobQueue.enqueue(job);

    return reply.code(202).send({
      status: 'accepted',
      submissionId: job.submissionId,
    });
  });

  return app;
}
