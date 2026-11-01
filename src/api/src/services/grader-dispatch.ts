import pg from 'pg';
import { JudgeJob } from '@cppdsa/shared';
import { ApiConfig } from '../config.js';

export async function dispatchSubmissionToGrader(
  pool: pg.Pool,
  config: ApiConfig,
  submissionId: string
): Promise<boolean> {
  try {
    const subRes = await pool.query(
      `SELECT s.id, s.assignment_id, s.submitted_code,
              a.mode, a.time_limit_ms, a.memory_limit_mb, a.template_code
       FROM submissions s
       JOIN assignments a ON s.assignment_id = a.id
       WHERE s.id = $1`,
      [submissionId]
    );
    if (subRes.rowCount === 0) return false;
    const sub = subRes.rows[0];

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
      hiddenTests: testsRes.rows.map((t: any) => ({
        id: t.id,
        input: t.input_data,
        expected: t.expected_output,
      })),
      callbackUrl: `${config.apiBaseUrl}/api/internal/grader-callback`,
    };

    if (job.mode === 'template') {
      let regions: Record<string, string> = {};
      try {
        regions =
          typeof sub.submitted_code === 'string'
            ? JSON.parse(sub.submitted_code)
            : sub.submitted_code || {};
      } catch {
        regions = { solve: sub.submitted_code || '' };
      }
      job.template = {
        source: sub.template_code,
        regions,
      };
    } else {
      job.free = {
        studentSource: sub.submitted_code,
      };
    }

    await fetch(`${config.graderUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Grader-Secret': config.graderSecret,
      },
      body: JSON.stringify(job),
    });
    return true;
  } catch {
    // If grader fails or network times out, submission stays PENDING for recovery
    return false;
  }
}
