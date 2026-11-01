import { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { JudgeResult } from '@cppdsa/shared';
import { ApiConfig } from '../config.js';
import { safeCompare } from '../utils/security.js';

export interface InternalRouteOptions {
  pool: pg.Pool;
  config: ApiConfig;
}

export const internalRoutes: FastifyPluginAsync<InternalRouteOptions> = async (app, options) => {
  const { pool, config } = options;

  // POST /api/internal/grader-callback
  app.post('/grader-callback', async (request, reply) => {
    // 1. Check secret env configured
    if (!config.graderSecret || config.graderSecret.trim().length === 0) {
      return reply.code(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'GRADER_SECRET chưa được cấu hình trên server',
      });
    }

    // 2. Check X-Grader-Secret header with constant-time compare
    const secretHeader = request.headers['x-grader-secret'] as string | undefined;
    if (!secretHeader || !safeCompare(secretHeader, config.graderSecret)) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'X-Grader-Secret không hợp lệ',
      });
    }

    const body = request.body as JudgeResult;
    if (!body || !body.submissionId) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'Dữ liệu kết quả không hợp lệ, thiếu submissionId',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const subRes = await client.query('SELECT * FROM submissions WHERE id = $1 FOR UPDATE', [
        body.submissionId,
      ]);

      if (subRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Không tìm thấy bài nộp tương ứng',
        });
      }

      const submission = subRes.rows[0];

      // Idempotency: If already completed or in final state, don't duplicate
      if (submission.status === 'COMPLETED' || submission.status === 'SYSTEM_ERROR') {
        await client.query('COMMIT');
        return reply.code(200).send({
          message: 'Callback already processed (idempotent)',
        });
      }

      // Fetch hidden test cases for this assignment
      const testsRes = await client.query(
        'SELECT id, order_index FROM test_cases WHERE assignment_id = $1 AND is_hidden = true ORDER BY order_index ASC',
        [submission.assignment_id]
      );
      const hiddenTests = testsRes.rows;

      // Validate test indices if tests are present
      if (Array.isArray(body.tests) && body.tests.length > 0) {
        const seenIndices = new Set<number>();
        let hasInvalidIndex = false;

        for (const t of body.tests) {
          if (
            typeof t.index !== 'number' ||
            !Number.isInteger(t.index) ||
            t.index < 0 ||
            t.index >= hiddenTests.length ||
            seenIndices.has(t.index)
          ) {
            hasInvalidIndex = true;
            break;
          }
          seenIndices.add(t.index);
        }

        if (hasInvalidIndex) {
          await client.query(
            `UPDATE submissions
             SET status = 'SYSTEM_ERROR',
                 compile_output = $1,
                 finished_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2`,
            ['Chỉ số test không hợp lệ hoặc bị trùng lặp từ grader', body.submissionId]
          );
          await client.query('COMMIT');
          return reply.code(400).send({
            error: 'BAD_REQUEST',
            message: 'Chỉ số test không hợp lệ hoặc bị trùng lặp',
          });
        }

        // Insert test results using 0-based index
        for (const t of body.tests) {
          const testCaseId = hiddenTests[t.index].id;
          await client.query(
            `INSERT INTO submission_test_results (submission_id, test_case_id, verdict, execution_time_ms, memory_used_kb)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (submission_id, test_case_id) DO NOTHING`,
            [body.submissionId, testCaseId, t.verdict, t.timeMs, t.memoryKb]
          );
        }
      }

      const finalStatus = body.status === 'DONE' ? 'COMPLETED' : 'SYSTEM_ERROR';
      const passedCount = Array.isArray(body.tests)
        ? body.tests.filter((t) => t.verdict === 'AC').length
        : 0;
      const totalCount = hiddenTests.length;
      const score = typeof body.score === 'number' ? body.score : 0;

      await client.query(
        `UPDATE submissions
         SET status = $1, score = $2, passed_tests = $3, total_tests = $4,
             compile_output = $5, finished_at = NOW(), updated_at = NOW()
         WHERE id = $6`,
        [
          finalStatus,
          score,
          passedCount,
          totalCount,
          body.compileMessage || null,
          body.submissionId,
        ]
      );

      await client.query('COMMIT');

      return reply.code(200).send({
        message: 'Callback processed successfully',
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
};
