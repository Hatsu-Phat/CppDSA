import crypto from 'node:crypto';
import { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { ApiConfig } from '../config.js';
import { parseStudentCsv } from '../utils/csv.js';
import { hashPassword } from '../utils/security.js';

export interface ClassroomRouteOptions {
  pool: pg.Pool;
  config: ApiConfig;
}

export const classroomRoutes: FastifyPluginAsync<ClassroomRouteOptions> = async (app, options) => {
  const { pool, config } = options;

  // POST /api/classrooms (Lecturer only)
  app.post('/', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền tạo lớp' });
    }

    const { name, description } = (request.body as { name?: string; description?: string }) || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Tên lớp học là bắt buộc' });
    }

    const res = await pool.query(
      'INSERT INTO classrooms (name, description, lecturer_id) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), description ? description.trim() : null, user.id]
    );

    return reply.code(201).send({ classroom: res.rows[0] });
  });

  // GET /api/classrooms (Lecturer: owned, Student: enrolled)
  app.get('/', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }

    if (user.role === 'LECTURER') {
      const res = await pool.query(
        'SELECT * FROM classrooms WHERE lecturer_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      return reply.code(200).send({ classrooms: res.rows });
    } else {
      const res = await pool.query(
        `SELECT c.* FROM classrooms c
         JOIN classroom_enrollments e ON c.id = e.classroom_id
         WHERE e.student_id = $1
         ORDER BY c.created_at DESC`,
        [user.id]
      );
      return reply.code(200).send({ classrooms: res.rows });
    }
  });

  // GET /api/classrooms/:id
  app.get('/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    const { id } = request.params as { id: string };

    const classRes = await pool.query('SELECT * FROM classrooms WHERE id = $1', [id]);
    if (classRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    }

    const classroom = classRes.rows[0];
    if (user.role === 'LECTURER') {
      if (classroom.lecturer_id !== user.id) {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
      }
    } else {
      const enrollRes = await pool.query(
        'SELECT id FROM classroom_enrollments WHERE classroom_id = $1 AND student_id = $2',
        [id, user.id]
      );
      if (enrollRes.rowCount === 0) {
        return reply
          .code(403)
          .send({ error: 'FORBIDDEN', message: 'Bạn chưa được ghi danh vào lớp học này' });
      }
    }

    return reply.code(200).send({ classroom });
  });

  // PUT /api/classrooms/:id (Lecturer owner only)
  app.put('/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    const { id } = request.params as { id: string };

    const classRes = await pool.query('SELECT * FROM classrooms WHERE id = $1', [id]);
    if (classRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    }
    if (classRes.rows[0].lecturer_id !== user.id) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
    }

    const { name, description } = (request.body as { name?: string; description?: string }) || {};
    const updated = await pool.query(
      `UPDATE classrooms
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [name?.trim(), description !== undefined ? description?.trim() : null, id]
    );

    return reply.code(200).send({ classroom: updated.rows[0] });
  });

  // DELETE /api/classrooms/:id (Lecturer owner only)
  app.delete('/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    const { id } = request.params as { id: string };

    const classRes = await pool.query('SELECT * FROM classrooms WHERE id = $1', [id]);
    if (classRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    }
    if (classRes.rows[0].lecturer_id !== user.id) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
    }

    await pool.query('DELETE FROM classrooms WHERE id = $1', [id]);
    return reply.code(200).send({ message: 'Đã xóa lớp học thành công' });
  });

  // POST /api/classrooms/:id/students/import (Lecturer owner only - US-01)
  app.post('/:id/students/import', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền import sinh viên' });
    }

    const { id } = request.params as { id: string };
    const classRes = await pool.query('SELECT * FROM classrooms WHERE id = $1', [id]);
    if (classRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    }
    if (classRes.rows[0].lecturer_id !== user.id) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
    }

    let csvContent = '';
    if (typeof request.body === 'string') {
      csvContent = request.body;
    } else if (request.body && typeof (request.body as { csv?: string }).csv === 'string') {
      csvContent = (request.body as { csv: string }).csv;
    } else {
      return reply
        .code(400)
        .send({ error: 'BAD_REQUEST', message: 'Nội dung CSV không được để trống' });
    }

    let parseResult;
    try {
      parseResult = parseStudentCsv(csvContent, config.maxCsvRows);
    } catch (err: any) {
      if (err.code === 'CSV_TOO_MANY_ROWS') {
        return reply.code(400).send({
          error: 'CSV_TOO_MANY_ROWS',
          message: err.message,
        });
      }
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: err.message || 'Lỗi phân tích cú pháp CSV',
      });
    }

    const { validRows, errors } = parseResult;
    let successCount = 0;
    const students: Array<{
      studentCode: string;
      email: string;
      temporaryPassword?: string;
      status: 'created' | 'existing';
    }> = [];
    const createdStudents: Array<{
      studentCode: string;
      email: string;
      temporaryPassword: string;
    }> = [];

    for (const student of validRows) {
      try {
        // Check if user exists
        let studentUserId: string;
        let isNewUser = false;
        let tempPassword = '';

        const userRes = await pool.query('SELECT id, role FROM users WHERE email = $1', [
          student.email.toLowerCase(),
        ]);

        if (userRes.rowCount === 0) {
          isNewUser = true;
          // Generate temporary password
          tempPassword = `Temp@${crypto.randomInt(100000, 999999)}`;
          const hash = await hashPassword(tempPassword);
          const newUserRes = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, role, must_change_password)
             VALUES ($1, $2, $3, 'STUDENT', true)
             RETURNING id`,
            [student.email.toLowerCase(), hash, student.fullName]
          );
          studentUserId = newUserRes.rows[0].id;
        } else {
          studentUserId = userRes.rows[0].id;
        }

        // Enroll in classroom
        const enrollRes = await pool.query(
          `INSERT INTO classroom_enrollments (classroom_id, student_id, student_code)
           VALUES ($1, $2, $3)
           ON CONFLICT (classroom_id, student_id) DO NOTHING
           RETURNING id`,
          [id, studentUserId, student.studentCode]
        );

        if (enrollRes.rowCount! > 0) {
          successCount++;
          if (isNewUser) {
            students.push({
              studentCode: student.studentCode,
              email: student.email,
              temporaryPassword: tempPassword,
              status: 'created',
            });
            createdStudents.push({
              studentCode: student.studentCode,
              email: student.email,
              temporaryPassword: tempPassword,
            });
          } else {
            students.push({
              studentCode: student.studentCode,
              email: student.email,
              status: 'existing',
            });
          }
        } else {
          errors.push({
            row: student.row,
            error: `Sinh viên với mã ${student.studentCode} đã tồn tại trong lớp này`,
          });
        }
      } catch {
        errors.push({
          row: student.row,
          error: 'Lỗi khi lưu thông tin sinh viên',
        });
      }
    }

    return reply.code(200).send({
      successCount,
      errorCount: errors.length,
      errors,
      students,
      createdStudents,
    });
  });

  // GET /api/classrooms/:id/students (Lecturer owner only)
  app.get('/:id/students', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Chỉ giảng viên mới có quyền xem danh sách sinh viên',
      });
    }

    const { id } = request.params as { id: string };
    const classRes = await pool.query('SELECT * FROM classrooms WHERE id = $1', [id]);
    if (classRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    }
    if (classRes.rows[0].lecturer_id !== user.id) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
    }

    const studentsRes = await pool.query(
      `SELECT u.id, e.student_code as "studentCode", u.full_name as "fullName", u.email, e.enrolled_at as "enrolledAt"
       FROM classroom_enrollments e
       JOIN users u ON e.student_id = u.id
       WHERE e.classroom_id = $1
       ORDER BY e.student_code ASC`,
      [id]
    );

    return reply.code(200).send({ students: studentsRes.rows });
  });

  // POST /api/classrooms/:id/students/:studentId/reset-password (Lecturer owner only - US-08)
  app.post('/:id/students/:studentId/reset-password', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền đặt lại mật khẩu' });
    }

    const { id, studentId } = request.params as { id: string; studentId: string };
    const classRes = await pool.query('SELECT * FROM classrooms WHERE id = $1', [id]);
    if (classRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    }
    if (classRes.rows[0].lecturer_id !== user.id) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
    }

    const enrollRes = await pool.query(
      'SELECT id FROM classroom_enrollments WHERE classroom_id = $1 AND student_id = $2',
      [id, studentId]
    );
    if (enrollRes.rowCount === 0) {
      return reply
        .code(404)
        .send({ error: 'NOT_FOUND', message: 'Sinh viên không thuộc lớp học này' });
    }

    const newTempPassword = `Reset@${crypto.randomInt(100000, 999999)}`;
    const newHash = await hashPassword(newTempPassword);

    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW() WHERE id = $2',
      [newHash, studentId]
    );

    // Invalidate existing sessions for this student
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [studentId]);

    return reply.code(200).send({
      message: 'Đặt lại mật khẩu thành công',
      temporaryPassword: newTempPassword,
    });
  });
};
