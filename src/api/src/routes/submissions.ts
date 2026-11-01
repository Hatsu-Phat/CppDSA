import { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { stitchTemplate, validateTemplateRegions } from '@cppdsa/shared';
import { ApiConfig } from '../config.js';
import { dispatchSubmissionToGrader } from '../services/grader-dispatch.js';

export interface SubmissionRouteOptions {
  pool: pg.Pool;
  config: ApiConfig;
}

export const submissionRoutes: FastifyPluginAsync<SubmissionRouteOptions> = async (
  app,
  options
) => {
  const { pool, config } = options;

  // POST /api/assignments/:id/submissions (Enrolled student only)
  app.post(
    '/assignments/:id/submissions',
    {
      config: {
        rateLimit: {
          max: 6,
          timeWindow: 60 * 1000,
          hook: 'preHandler',
          keyGenerator: (req) => req.user?.id || req.ip,
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'Bạn đã nộp bài quá nhanh (tối đa 6 lần/phút). Vui lòng đợi.',
          }),
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
      }
      if (user.role !== 'STUDENT') {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Chỉ sinh viên mới có quyền nộp bài' });
      }

      const { id: assignmentId } = request.params as { id: string };

      // Verify assignment and enrollment
      const assignRes = await pool.query(
        `SELECT a.*, c.id as classroom_id
         FROM assignments a
         JOIN classrooms c ON a.classroom_id = c.id
         WHERE a.id = $1`,
        [assignmentId]
      );

      if (assignRes.rowCount === 0) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
      }

      const assignment = assignRes.rows[0];

      const enrollRes = await pool.query(
        'SELECT id FROM classroom_enrollments WHERE classroom_id = $1 AND student_id = $2',
        [assignment.classroom_id, user.id]
      );

      if (enrollRes.rowCount === 0) {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          message: 'Bạn chưa được ghi danh vào lớp của bài tập này',
        });
      }

      const body = request.body as {
        regions?: Record<string, string>;
        studentSource?: string;
        entry?: { type: 'function' | 'method'; name: string; className?: string };
      };

      const now = config.now ? config.now() : new Date();
      const isLate = now.getTime() > new Date(assignment.deadline).getTime();

      let submittedCode = '';
      let entryPointDeclaration: any = null;

      if (assignment.mode === 'TEMPLATE') {
        if (!body.regions || typeof body.regions !== 'object' || Array.isArray(body.regions)) {
          return reply.code(400).send({
            error: 'INVALID_TEMPLATE_REGIONS',
            message: 'Mode TEMPLATE yêu cầu object regions',
          });
        }

        // Check size of student code
        let totalBytes = 0;
        for (const code of Object.values(body.regions)) {
          if (typeof code !== 'string') {
            return reply
              .code(400)
              .send({ error: 'BAD_REQUEST', message: 'Mã nguồn trong vùng phải là chuỗi' });
          }
          totalBytes += Buffer.byteLength(code, 'utf8');
        }

        if (totalBytes > config.maxStudentCodeBytes) {
          return reply.code(413).send({
            error: 'PAYLOAD_TOO_LARGE',
            message: `Mã sinh viên vượt quá dung lượng tối đa (${config.maxStudentCodeBytes} bytes)`,
          });
        }

        const validRegions = validateTemplateRegions(assignment.template_code, body.regions);
        if (!validRegions.valid) {
          return reply.code(400).send({
            error: 'INVALID_TEMPLATE_REGIONS',
            message: validRegions.error || 'Vùng nộp bài không khớp template',
          });
        }

        const stitched = stitchTemplate(assignment.template_code, body.regions);
        if (!stitched.success) {
          return reply.code(400).send({
            error: 'INVALID_TEMPLATE_REGIONS',
            message: stitched.error || 'Ghép mã template thất bại',
          });
        }

        submittedCode = JSON.stringify(body.regions);
      } else {
        // FREE mode
        if (typeof body.studentSource !== 'string') {
          return reply
            .code(400)
            .send({ error: 'BAD_REQUEST', message: 'studentSource là bắt buộc đối với mode FREE' });
        }

        const sourceBytes = Buffer.byteLength(body.studentSource, 'utf8');
        if (sourceBytes > config.maxStudentCodeBytes) {
          return reply.code(413).send({
            error: 'PAYLOAD_TOO_LARGE',
            message: `Mã sinh viên vượt quá dung lượng tối đa (${config.maxStudentCodeBytes} bytes)`,
          });
        }

        submittedCode = body.studentSource;
        entryPointDeclaration = null;
      }

      // Insert submission
      const subRes = await pool.query(
        `INSERT INTO submissions (assignment_id, student_id, submitted_code, entry_point_declaration, status, is_late, created_at)
         VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
         RETURNING *`,
        [
          assignmentId,
          user.id,
          submittedCode,
          entryPointDeclaration ? JSON.stringify(entryPointDeclaration) : null,
          isLate,
          now,
        ]
      );

      const submission = subRes.rows[0];

      // Dispatch to grader using shared helper
      await dispatchSubmissionToGrader(pool, config, submission.id);

      return reply.code(201).send({
        submission: {
          id: submission.id,
          status: submission.status,
          isLate: submission.is_late,
          createdAt: submission.created_at,
        },
      });
    }
  );

  // GET /api/assignments/:id/submissions
  app.get('/assignments/:id/submissions', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    const { id: assignmentId } = request.params as { id: string };

    const assignRes = await pool.query(
      `SELECT a.*, c.lecturer_id
       FROM assignments a
       JOIN classrooms c ON a.classroom_id = c.id
       WHERE a.id = $1`,
      [assignmentId]
    );

    if (assignRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    }

    const assignment = assignRes.rows[0];

    if (user.role === 'LECTURER') {
      if (assignment.lecturer_id !== user.id) {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });
      }

      const res = await pool.query(
        `SELECT s.id, s.assignment_id as "assignmentId", s.student_id as "studentId",
                u.full_name as "studentName", u.email as "studentEmail",
                s.status, s.score, s.passed_tests as "passedTests", s.total_tests as "totalTests",
                s.is_late as "isLate", s.created_at as "createdAt", s.finished_at as "finishedAt"
         FROM submissions s
         JOIN users u ON s.student_id = u.id
         WHERE s.assignment_id = $1
         ORDER BY s.created_at DESC`,
        [assignmentId]
      );

      return reply.code(200).send({ submissions: res.rows });
    } else {
      // Student: only own submissions
      const enrollRes = await pool.query(
        'SELECT id FROM classroom_enrollments WHERE classroom_id = $1 AND student_id = $2',
        [assignment.classroom_id, user.id]
      );
      if (enrollRes.rowCount === 0) {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Bạn chưa được ghi danh vào lớp này' });
      }

      const res = await pool.query(
        `SELECT id, assignment_id as "assignmentId", status, score,
                passed_tests as "passedTests", total_tests as "totalTests",
                is_late as "isLate", created_at as "createdAt", finished_at as "finishedAt"
         FROM submissions
         WHERE assignment_id = $1 AND student_id = $2
         ORDER BY created_at DESC`,
        [assignmentId, user.id]
      );

      return reply.code(200).send({ submissions: res.rows });
    }
  });

  // GET /api/submissions/:id
  app.get('/submissions/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    const { id } = request.params as { id: string };

    const subRes = await pool.query(
      `SELECT s.*, c.lecturer_id
       FROM submissions s
       JOIN assignments a ON s.assignment_id = a.id
       JOIN classrooms c ON a.classroom_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    if (subRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài nộp' });
    }

    const sub = subRes.rows[0];
    const isOwnerStudent = sub.student_id === user.id;
    const isOwnerLecturer = sub.lecturer_id === user.id;

    if (!isOwnerStudent && !isOwnerLecturer) {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Bạn không có quyền xem bài nộp này' });
    }

    if (isOwnerStudent) {
      // Student response: NEVER include hidden test input, expected output, or excerpt!
      const testResultsRes = await pool.query(
        `SELECT r.test_case_id as "testCaseId", t.order_index as "orderIndex",
                r.verdict, r.execution_time_ms as "executionTimeMs", r.memory_used_kb as "memoryUsedKb"
         FROM submission_test_results r
         JOIN test_cases t ON r.test_case_id = t.id
         WHERE r.submission_id = $1
         ORDER BY t.order_index ASC`,
        [id]
      );

      return reply.code(200).send({
        submission: {
          id: sub.id,
          assignmentId: sub.assignment_id,
          status: sub.status,
          score: sub.score,
          passedTests: sub.passed_tests,
          totalTests: sub.total_tests,
          isLate: sub.is_late,
          compileOutput: sub.compile_output,
          createdAt: sub.created_at,
          finishedAt: sub.finished_at,
          tests: testResultsRes.rows,
        },
      });
    } else {
      // Lecturer response: includes full code and excerpts
      const testResultsRes = await pool.query(
        `SELECT r.test_case_id as "testCaseId", t.order_index as "orderIndex",
                r.verdict, r.execution_time_ms as "executionTimeMs", r.memory_used_kb as "memoryUsedKb",
                r.student_output_excerpt as "studentOutputExcerpt"
         FROM submission_test_results r
         JOIN test_cases t ON r.test_case_id = t.id
         WHERE r.submission_id = $1
         ORDER BY t.order_index ASC`,
        [id]
      );

      return reply.code(200).send({
        submission: {
          id: sub.id,
          assignmentId: sub.assignment_id,
          studentId: sub.student_id,
          submittedCode: sub.submitted_code,
          entryPointDeclaration: sub.entry_point_declaration,
          status: sub.status,
          score: sub.score,
          passedTests: sub.passed_tests,
          totalTests: sub.total_tests,
          isLate: sub.is_late,
          compileOutput: sub.compile_output,
          createdAt: sub.created_at,
          finishedAt: sub.finished_at,
          tests: testResultsRes.rows,
        },
      });
    }
  });

  // GET /api/classrooms/:id/submissions (Lecturer owner only - US-05-1)
  app.get('/classrooms/:id/submissions', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Chỉ giảng viên mới có quyền xem danh sách bài nộp lớp',
      });
    }

    const { id: classroomId } = request.params as { id: string };
    const classRes = await pool.query('SELECT lecturer_id FROM classrooms WHERE id = $1', [
      classroomId,
    ]);
    if (classRes.rowCount === 0)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    if (classRes.rows[0].lecturer_id !== user.id) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
    }

    const query = request.query as {
      assignmentId?: string;
      from?: string;
      to?: string;
      status?: string;
      minScore?: string;
      maxScore?: string;
    };

    let sql = `
      SELECT s.id, s.assignment_id as "assignmentId", a.title as "assignmentTitle",
             s.student_id as "studentId", u.full_name as "studentName", u.email as "studentEmail",
             e.student_code as "studentCode",
             s.status, s.score, s.passed_tests as "passedTests", s.total_tests as "totalTests",
             s.is_late as "isLate", s.created_at as "createdAt", s.finished_at as "finishedAt"
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      JOIN users u ON s.student_id = u.id
      LEFT JOIN classroom_enrollments e ON e.classroom_id = a.classroom_id AND e.student_id = s.student_id
      WHERE a.classroom_id = $1
    `;

    const params: any[] = [classroomId];
    let paramIdx = 2;

    if (query.assignmentId) {
      sql += ` AND s.assignment_id = $${paramIdx++}`;
      params.push(query.assignmentId);
    }
    if (query.status) {
      sql += ` AND s.status = $${paramIdx++}`;
      params.push(query.status);
    }
    if (query.from) {
      sql += ` AND s.created_at >= $${paramIdx++}`;
      params.push(new Date(query.from));
    }
    if (query.to) {
      sql += ` AND s.created_at <= $${paramIdx++}`;
      params.push(new Date(query.to));
    }
    if (query.minScore !== undefined) {
      sql += ` AND s.score >= $${paramIdx++}`;
      params.push(Number(query.minScore));
    }
    if (query.maxScore !== undefined) {
      sql += ` AND s.score <= $${paramIdx++}`;
      params.push(Number(query.maxScore));
    }

    sql += ' ORDER BY s.created_at DESC';

    const res = await pool.query(sql, params);
    return reply.code(200).send({ submissions: res.rows });
  });

  // PATCH /api/submissions/:id/score (Lecturer owner only)
  app.patch('/submissions/:id/score', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền sửa điểm bài nộp' });
    }

    const { id } = request.params as { id: string };
    const subRes = await pool.query(
      `SELECT s.*, c.lecturer_id
       FROM submissions s
       JOIN assignments a ON s.assignment_id = a.id
       JOIN classrooms c ON a.classroom_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    if (subRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài nộp' });
    }
    if (subRes.rows[0].lecturer_id !== user.id) {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập của bài nộp này' });
    }

    const { score } = (request.body as { score?: any }) || {};
    if (typeof score !== 'number' || isNaN(score) || score < 0 || score > 1) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'score phải là số trong khoảng [0, 1]',
      });
    }

    const normalizedScore = Number(score.toFixed(2));
    const updateRes = await pool.query(
      `UPDATE submissions
       SET score = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [normalizedScore, id]
    );

    const row = updateRes.rows[0];
    return reply.code(200).send({
      submission: {
        id: row.id,
        assignmentId: row.assignment_id,
        studentId: row.student_id,
        submittedCode: row.submitted_code,
        entryPointDeclaration: row.entry_point_declaration,
        status: row.status,
        score: Number(row.score),
        passedTests: row.passed_tests,
        totalTests: row.total_tests,
        isLate: row.is_late,
        compileOutput: row.compile_output,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        finishedAt: row.finished_at,
      },
    });
  });

  // POST /api/submissions/:id/regrade (Lecturer owner only)
  app.post('/submissions/:id/regrade', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền chấm lại bài nộp' });
    }

    const { id } = request.params as { id: string };
    const subRes = await pool.query(
      `SELECT s.*, c.lecturer_id
       FROM submissions s
       JOIN assignments a ON s.assignment_id = a.id
       JOIN classrooms c ON a.classroom_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    if (subRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài nộp' });
    }
    if (subRes.rows[0].lecturer_id !== user.id) {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập của bài nộp này' });
    }

    // Delete existing test results
    await pool.query('DELETE FROM submission_test_results WHERE submission_id = $1', [id]);

    // Reset submission status
    const resetRes = await pool.query(
      `UPDATE submissions
       SET status = 'PENDING',
           score = 0,
           passed_tests = 0,
           retry_count = 0,
           compile_output = NULL,
           finished_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Dispatch to grader using shared helper
    await dispatchSubmissionToGrader(pool, config, id);

    return reply.code(200).send({
      message: 'Đã gửi yêu cầu chấm lại',
      submission: {
        id: resetRes.rows[0].id,
        status: resetRes.rows[0].status,
      },
    });
  });
};
