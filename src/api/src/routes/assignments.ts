import { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { ApiConfig } from '../config.js';
import { validateTemplateMarkers } from '../utils/template.js';
import { dispatchSubmissionToGrader } from '../services/grader-dispatch.js';
import { StatementStorageService } from '../services/statement-storage.js';

export interface AssignmentRouteOptions {
  pool: pg.Pool;
  config: ApiConfig;
}

export const assignmentRoutes: FastifyPluginAsync<AssignmentRouteOptions> = async (
  app,
  options
) => {
  const { pool, config } = options;
  const storageService = new StatementStorageService(config);

  // Helper to verify classroom ownership
  const verifyClassroomOwner = async (classroomId: string, userId: string) => {
    const res = await pool.query('SELECT lecturer_id FROM classrooms WHERE id = $1', [classroomId]);
    if (res.rowCount === 0) return { exists: false, isOwner: false };
    return { exists: true, isOwner: res.rows[0].lecturer_id === userId };
  };

  // Helper to verify assignment ownership
  const verifyAssignmentAccess = async (assignmentId: string, user: any) => {
    const res = await pool.query(
      `SELECT a.*, c.lecturer_id
       FROM assignments a
       JOIN classrooms c ON a.classroom_id = c.id
       WHERE a.id = $1`,
      [assignmentId]
    );
    if (res.rowCount === 0)
      return { exists: false, isOwner: false, isEnrolled: false, assignment: null };

    const assignment = res.rows[0];
    const isOwner = assignment.lecturer_id === user.id;

    let isEnrolled = false;
    if (user.role === 'STUDENT') {
      const enrollRes = await pool.query(
        'SELECT id FROM classroom_enrollments WHERE classroom_id = $1 AND student_id = $2',
        [assignment.classroom_id, user.id]
      );
      isEnrolled = enrollRes.rowCount! > 0;
    }

    return { exists: true, isOwner, isEnrolled, assignment };
  };

  // POST /api/classrooms/:id/assignments (Lecturer owner only)
  app.post('/classrooms/:id/assignments', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền tạo bài tập' });
    }

    const { id: classroomId } = request.params as { id: string };
    const { exists, isOwner } = await verifyClassroomOwner(classroomId, user.id);
    if (!exists)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    if (!isOwner)
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });

    const body = request.body as {
      title?: string;
      description?: string;
      mode?: string;
      timeLimitMs?: number;
      memoryLimitMb?: number;
      deadline?: string;
      templateCode?: string;
      entryPointSpec?: any;
    };

    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Tiêu đề bài tập là bắt buộc' });
    }

    const mode = (body.mode || '').toUpperCase();
    if (mode !== 'TEMPLATE' && mode !== 'FREE') {
      return reply
        .code(400)
        .send({ error: 'BAD_REQUEST', message: "Chế độ bài tập phải là 'TEMPLATE' hoặc 'FREE'" });
    }

    if (!body.deadline || isNaN(new Date(body.deadline).getTime())) {
      return reply
        .code(400)
        .send({ error: 'BAD_REQUEST', message: 'Hạn nộp (deadline) không hợp lệ' });
    }

    const timeLimitMs = body.timeLimitMs !== undefined ? body.timeLimitMs : 1000;
    if (
      typeof timeLimitMs !== 'number' ||
      !Number.isInteger(timeLimitMs) ||
      timeLimitMs < 100 ||
      timeLimitMs > 10000
    ) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'timeLimitMs phải là số nguyên trong khoảng [100, 10000]',
      });
    }

    const memoryLimitMb = body.memoryLimitMb !== undefined ? body.memoryLimitMb : 256;
    if (
      typeof memoryLimitMb !== 'number' ||
      !Number.isInteger(memoryLimitMb) ||
      memoryLimitMb < 16 ||
      memoryLimitMb > 512
    ) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'memoryLimitMb phải là số nguyên trong khoảng [16, 512]',
      });
    }

    const templateCode = mode === 'TEMPLATE' ? body.templateCode || null : null;
    const entryPointSpec = null;

    if (mode === 'TEMPLATE') {
      if (!templateCode) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'Template code là bắt buộc đối với mode TEMPLATE',
        });
      }

      const byteLen = Buffer.byteLength(templateCode, 'utf8');
      if (byteLen > config.maxTemplateBytes) {
        return reply.code(413).send({
          error: 'PAYLOAD_TOO_LARGE',
          message: `Mã template vượt quá dung lượng tối đa (${config.maxTemplateBytes} bytes)`,
        });
      }

      const markerCheck = validateTemplateMarkers(templateCode);
      if (!markerCheck.valid) {
        return reply.code(400).send({
          error: 'INVALID_TEMPLATE_MARKERS',
          message: markerCheck.error || 'Cấu trúc marker template không hợp lệ',
        });
      }
    }

    const insertRes = await pool.query(
      `INSERT INTO assignments (classroom_id, title, description, mode, time_limit_ms, memory_limit_mb, deadline, template_code, entry_point_spec)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        classroomId,
        body.title.trim(),
        body.description ? body.description.trim() : null,
        mode,
        timeLimitMs,
        memoryLimitMb,
        new Date(body.deadline),
        templateCode,
        entryPointSpec ? JSON.stringify(entryPointSpec) : null,
      ]
    );

    return reply.code(201).send({ assignment: insertRes.rows[0] });
  });

  // GET /api/classrooms/:id/assignments (Lecturer owner or Enrolled student)
  app.get('/classrooms/:id/assignments', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    const { id: classroomId } = request.params as { id: string };

    const classRes = await pool.query('SELECT lecturer_id FROM classrooms WHERE id = $1', [
      classroomId,
    ]);
    if (classRes.rowCount === 0)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });

    if (user.role === 'LECTURER') {
      if (classRes.rows[0].lecturer_id !== user.id) {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
      }

      const res = await pool.query(
        'SELECT * FROM assignments WHERE classroom_id = $1 ORDER BY created_at DESC',
        [classroomId]
      );
      const assignments = res.rows.map((a: any) => {
        const statement = a.statement_file_name
          ? { name: a.statement_file_name, size: a.statement_file_size }
          : null;
        delete a.statement_file_id;
        delete a.statement_storage;
        delete a.statement_file_name;
        delete a.statement_file_size;
        return { ...a, statement };
      });
      return reply.code(200).send({ assignments });
    } else {
      const enrollRes = await pool.query(
        'SELECT id FROM classroom_enrollments WHERE classroom_id = $1 AND student_id = $2',
        [classroomId, user.id]
      );
      if (enrollRes.rowCount === 0) {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Bạn chưa được ghi danh vào lớp học này' });
      }

      // Query assignments with student's best score
      const res = await pool.query(
        `SELECT a.id, a.classroom_id, a.title, a.description, a.mode, a.time_limit_ms, a.memory_limit_mb,
                a.deadline, a.created_at, a.statement_file_name, a.statement_file_size,
                MAX(CASE WHEN s.status = 'COMPLETED' AND s.is_late = false THEN s.score ELSE NULL END) as "bestScore",
                COUNT(s.id) as "submissionCount"
         FROM assignments a
         LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = $1
         WHERE a.classroom_id = $2
         GROUP BY a.id
         ORDER BY a.created_at DESC`,
        [user.id, classroomId]
      );

      const assignments = res.rows.map((a: any) => {
        const statement = a.statement_file_name
          ? { name: a.statement_file_name, size: a.statement_file_size }
          : null;
        delete a.statement_file_name;
        delete a.statement_file_size;
        return { ...a, statement };
      });

      return reply.code(200).send({ assignments });
    }
  });

  // GET /api/assignments/:id
  app.get('/assignments/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    const { id } = request.params as { id: string };

    const { exists, isOwner, isEnrolled, assignment } = await verifyAssignmentAccess(id, user);
    if (!exists)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });

    if (user.role === 'LECTURER' && !isOwner) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });
    }
    if (user.role === 'STUDENT' && !isEnrolled) {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Bạn không có quyền truy cập bài tập này' });
    }

    // Public / sample test cases only!
    const sampleTestsRes = await pool.query(
      `SELECT id, order_index, input_data, expected_output, is_sample
       FROM test_cases
       WHERE assignment_id = $1 AND (is_hidden = false OR is_sample = true)
       ORDER BY order_index ASC`,
      [id]
    );

    const result: any = {
      ...assignment,
      sampleTests: sampleTestsRes.rows,
      statement: assignment.statement_file_name
        ? {
            name: assignment.statement_file_name,
            size: assignment.statement_file_size,
          }
        : null,
    };

    // Remove internal lecturer_id and storage credentials/ids before sending
    delete result.lecturer_id;
    delete result.statement_storage;
    delete result.statement_file_id;
    delete result.statement_file_name;
    delete result.statement_file_size;

    return reply.code(200).send({ assignment: result });
  });

  // PUT /api/assignments/:id (Lecturer owner only)
  app.put('/assignments/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền cập nhật bài tập' });
    }

    const { id } = request.params as { id: string };
    const { exists, isOwner, assignment } = await verifyAssignmentAccess(id, user);
    if (!exists)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    if (!isOwner)
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });

    const body = request.body as any;
    const title = body.title !== undefined ? body.title : assignment.title;
    const description = body.description !== undefined ? body.description : assignment.description;

    if (body.timeLimitMs !== undefined) {
      if (
        typeof body.timeLimitMs !== 'number' ||
        !Number.isInteger(body.timeLimitMs) ||
        body.timeLimitMs < 100 ||
        body.timeLimitMs > 10000
      ) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'timeLimitMs phải là số nguyên trong khoảng [100, 10000]',
        });
      }
    }
    const timeLimitMs =
      body.timeLimitMs !== undefined ? body.timeLimitMs : assignment.time_limit_ms;

    if (body.memoryLimitMb !== undefined) {
      if (
        typeof body.memoryLimitMb !== 'number' ||
        !Number.isInteger(body.memoryLimitMb) ||
        body.memoryLimitMb < 16 ||
        body.memoryLimitMb > 512
      ) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'memoryLimitMb phải là số nguyên trong khoảng [16, 512]',
        });
      }
    }
    const memoryLimitMb =
      body.memoryLimitMb !== undefined ? body.memoryLimitMb : assignment.memory_limit_mb;
    const deadline = body.deadline !== undefined ? new Date(body.deadline) : assignment.deadline;
    const templateCode =
      assignment.mode === 'TEMPLATE'
        ? body.templateCode !== undefined
          ? body.templateCode
          : assignment.template_code
        : null;
    const entryPointSpec =
      assignment.mode === 'FREE'
        ? null
        : body.entryPointSpec !== undefined
          ? body.entryPointSpec
          : assignment.entry_point_spec;

    if (assignment.mode === 'TEMPLATE' && templateCode) {
      if (Buffer.byteLength(templateCode, 'utf8') > config.maxTemplateBytes) {
        return reply.code(413).send({
          error: 'PAYLOAD_TOO_LARGE',
          message: `Mã template vượt quá dung lượng tối đa (${config.maxTemplateBytes} bytes)`,
        });
      }
      const markerCheck = validateTemplateMarkers(templateCode);
      if (!markerCheck.valid) {
        return reply.code(400).send({
          error: 'INVALID_TEMPLATE_MARKERS',
          message: markerCheck.error || 'Cấu trúc marker template không hợp lệ',
        });
      }
    }

    const updated = await pool.query(
      `UPDATE assignments
       SET title = $1, description = $2, time_limit_ms = $3, memory_limit_mb = $4,
           deadline = $5, template_code = $6, entry_point_spec = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        title,
        description,
        timeLimitMs,
        memoryLimitMb,
        deadline,
        templateCode,
        entryPointSpec ? JSON.stringify(entryPointSpec) : null,
        id,
      ]
    );

    return reply.code(200).send({ assignment: updated.rows[0] });
  });

  // DELETE /api/assignments/:id (Lecturer owner only)
  app.delete('/assignments/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền xóa bài tập' });
    }

    const { id } = request.params as { id: string };
    const { exists, isOwner, assignment } = await verifyAssignmentAccess(id, user);
    if (!exists)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    if (!isOwner)
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });

    if (assignment.statement_file_id && assignment.statement_storage) {
      try {
        await storageService.delete(assignment.statement_storage, assignment.statement_file_id);
      } catch (delErr) {
        request.log.warn({ err: delErr }, 'Failed to delete statement file from storage');
      }
    }

    await pool.query('DELETE FROM assignments WHERE id = $1', [id]);
    return reply.code(200).send({ message: 'Đã xóa bài tập thành công' });
  });

  // PUT /api/assignments/:id/statement (Lecturer owner only)
  app.put(
    '/assignments/:id/statement',
    { bodyLimit: config.maxStatementPdfBytes },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
      }
      if (user.role !== 'LECTURER') {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền cập nhật đề bài' });
      }

      const { id } = request.params as { id: string };
      const { exists, isOwner, assignment } = await verifyAssignmentAccess(id, user);
      if (!exists) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
      }
      if (!isOwner) {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });
      }

      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'Nội dung file PDF không hợp lệ hoặc rỗng',
        });
      }

      if (body.length > config.maxStatementPdfBytes) {
        return reply.code(413).send({
          error: 'PAYLOAD_TOO_LARGE',
          message: `Dung lượng file PDF vượt quá giới hạn cho phép (${config.maxStatementPdfBytes} bytes)`,
        });
      }

      // Check first 5 bytes for '%PDF-'
      if (body.length < 5 || body.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'File không phải là định dạng PDF hợp lệ (thiếu marker %PDF-)',
        });
      }

      let fileName = 'statement.pdf';
      const rawFileNameHeader = request.headers['x-file-name'];
      if (typeof rawFileNameHeader === 'string' && rawFileNameHeader.trim()) {
        try {
          fileName = decodeURIComponent(rawFileNameHeader.trim());
        } catch {
          fileName = rawFileNameHeader.trim();
        }
      }
      if (fileName.length > 255) {
        fileName = fileName.substring(0, 255);
      }

      try {
        const uploadResult = await storageService.upload(fileName, body);
        const oldStorage = assignment.statement_storage;
        const oldFileId = assignment.statement_file_id;

        await pool.query(
          `UPDATE assignments
           SET statement_storage = $1, statement_file_id = $2, statement_file_name = $3,
               statement_file_size = $4, updated_at = NOW()
           WHERE id = $5`,
          [uploadResult.storage, uploadResult.fileId, fileName, body.length, id]
        );

        // Delete old file from storage after saving new file successfully
        if (oldFileId && oldStorage) {
          try {
            await storageService.delete(oldStorage, oldFileId);
          } catch (delErr) {
            request.log.warn({ err: delErr }, 'Failed to delete old statement file');
          }
        }

        return reply.code(200).send({
          message: 'Tải lên đề bài PDF thành công',
          statement: {
            name: fileName,
            size: body.length,
          },
        });
      } catch (err: any) {
        if (err.statusCode === 503 || err.message === 'Chưa cấu hình lưu trữ đề bài PDF') {
          return reply.code(503).send({
            error: 'SERVICE_UNAVAILABLE',
            message: 'Chưa cấu hình lưu trữ đề bài PDF',
          });
        }
        throw err;
      }
    }
  );

  // GET /api/assignments/:id/statement (Lecturer owner or Enrolled student)
  app.get('/assignments/:id/statement', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    const { id } = request.params as { id: string };

    const { exists, isOwner, isEnrolled, assignment } = await verifyAssignmentAccess(id, user);
    if (!exists) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    }

    if (user.role === 'LECTURER' && !isOwner) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });
    }
    if (user.role === 'STUDENT' && !isEnrolled) {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Bạn không có quyền truy cập bài tập này' });
    }
    if (user.role !== 'LECTURER' && user.role !== 'STUDENT') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Không có quyền truy cập' });
    }

    if (!assignment.statement_file_id || !assignment.statement_storage) {
      return reply
        .code(404)
        .send({ error: 'NOT_FOUND', message: 'Bài tập chưa có file đề bài PDF' });
    }

    try {
      const buffer = await storageService.download(
        assignment.statement_storage,
        assignment.statement_file_id
      );

      const fileName = assignment.statement_file_name || 'statement.pdf';
      const encodedFileName = encodeURIComponent(fileName);

      return reply
        .type('application/pdf')
        .header('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`)
        .header('Cache-Control', 'private, max-age=300')
        .send(buffer);
    } catch (err: any) {
      if (err.statusCode === 404) {
        return reply
          .code(404)
          .send({ error: 'NOT_FOUND', message: 'Không tìm thấy file đề bài PDF' });
      }
      throw err;
    }
  });

  // DELETE /api/assignments/:id/statement (Lecturer owner only)
  app.delete('/assignments/:id/statement', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền xóa file đề bài' });
    }

    const { id } = request.params as { id: string };
    const { exists, isOwner, assignment } = await verifyAssignmentAccess(id, user);
    if (!exists) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    }
    if (!isOwner) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });
    }

    const oldStorage = assignment.statement_storage;
    const oldFileId = assignment.statement_file_id;

    await pool.query(
      `UPDATE assignments
       SET statement_storage = NULL, statement_file_id = NULL, statement_file_name = NULL,
           statement_file_size = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    if (oldFileId && oldStorage) {
      try {
        await storageService.delete(oldStorage, oldFileId);
      } catch (delErr) {
        request.log.warn({ err: delErr }, 'Failed to delete statement file from storage');
      }
    }

    return reply.code(200).send({ message: 'Đã xóa file đề bài PDF thành công' });
  });

  // POST /api/assignments/:id/regrade (Lecturer owner only)
  app.post('/assignments/:id/regrade', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền chấm lại bài tập' });
    }

    const { id } = request.params as { id: string };
    const { exists, isOwner } = await verifyAssignmentAccess(id, user);
    if (!exists) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    }
    if (!isOwner) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });
    }

    const subsRes = await pool.query(
      'SELECT id FROM submissions WHERE assignment_id = $1 ORDER BY created_at ASC',
      [id]
    );

    if (subsRes.rowCount! > 0) {
      await pool.query(
        'DELETE FROM submission_test_results WHERE submission_id IN (SELECT id FROM submissions WHERE assignment_id = $1)',
        [id]
      );
      await pool.query(
        `UPDATE submissions
         SET status = 'PENDING', score = 0, passed_tests = 0, retry_count = 0,
             compile_output = NULL, finished_at = NULL, updated_at = NOW()
         WHERE assignment_id = $1`,
        [id]
      );

      // Sequentially dispatch jobs to avoid overwhelming grader (concurrency 1)
      for (const sub of subsRes.rows) {
        await dispatchSubmissionToGrader(pool, config, sub.id);
      }
    }

    return reply.code(200).send({ queued: subsRes.rowCount || 0 });
  });
};
