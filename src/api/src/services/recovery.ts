import pg from 'pg';
import { decideRecovery } from '@cppdsa/shared';
import { dispatchSubmissionToGrader } from './grader-dispatch.js';

export interface RecoveryOptions {
  pool: pg.Pool;
  graderUrl: string;
  graderSecret: string;
  apiBaseUrl: string;
  now?: Date;
}

export async function runRecovery(
  options: RecoveryOptions
): Promise<{ retried: number; failed: number }> {
  const { pool, graderUrl, graderSecret, apiBaseUrl, now = new Date() } = options;
  let retried = 0;
  let failed = 0;

  try {
    const query = `
      SELECT s.id, s.status, s.updated_at, s.retry_count, s.submitted_code, s.entry_point_declaration,
             s.assignment_id, a.mode, a.time_limit_ms, a.memory_limit_mb, a.template_code, a.entry_point_spec
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      WHERE s.status IN ('PENDING', 'RUNNING')
    `;
    const res = await pool.query(query);

    for (const sub of res.rows) {
      const decision = decideRecovery(
        {
          id: sub.id,
          status: sub.status as 'PENDING' | 'RUNNING',
          updatedAt: sub.updated_at,
          retryCount: sub.retry_count,
        },
        now
      );

      if (decision.action === 'RETRY') {
        retried++;
        await pool.query(
          'UPDATE submissions SET retry_count = $1, updated_at = NOW() WHERE id = $2',
          [decision.retryCount, sub.id]
        );

        // Dispatch to grader
        await dispatchSubmissionToGrader(
          pool,
          { graderUrl, graderSecret, apiBaseUrl } as any,
          sub.id
        );
      } else if (decision.action === 'MARK_SYSTEM_ERROR') {
        failed++;
        await pool.query(
          "UPDATE submissions SET status = 'SYSTEM_ERROR', updated_at = NOW() WHERE id = $1",
          [sub.id]
        );
      }
    }
  } catch {
    // Suppress error in recovery background process
  }

  return { retried, failed };
}
