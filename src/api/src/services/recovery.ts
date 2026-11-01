import pg from 'pg';
import { decideRecovery, JudgeJob } from '@cppdsa/shared';

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

        // Fetch hidden tests and send to grader
        try {
          const testsRes = await pool.query(
            'SELECT id, input_data, expected_output FROM test_cases WHERE assignment_id = $1 AND is_hidden = true ORDER BY order_index ASC',
            [sub.assignment_id]
          );

          const job: JudgeJob = {
            submissionId: sub.id,
            mode: sub.mode.toLowerCase() as 'template' | 'free',
            language: 'cpp17',
            timeLimitMs: sub.time_limit_ms,
            memoryLimitMb: sub.memory_limit_mb,
            compare: 'trim-trailing',
            hiddenTests: testsRes.rows.map((t) => ({
              id: t.id,
              input: t.input_data,
              expected: t.expected_output,
            })),
            callbackUrl: `${apiBaseUrl}/api/internal/grader-callback`,
          };

          if (job.mode === 'template') {
            job.template = {
              source: sub.template_code,
              regions: JSON.parse(sub.submitted_code),
            };
          } else {
            job.free = {
              harness: sub.entry_point_spec?.harness || '',
              entry:
                typeof sub.entry_point_declaration === 'string'
                  ? JSON.parse(sub.entry_point_declaration)
                  : sub.entry_point_declaration,
              studentSource: sub.submitted_code,
            };
          }

          await fetch(`${graderUrl}/jobs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Grader-Secret': graderSecret,
            },
            body: JSON.stringify(job),
          });
        } catch {
          // If grader is down, submission remains PENDING/RUNNING with incremented retry_count
        }
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
