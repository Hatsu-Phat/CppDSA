import { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { ApiConfig } from '../config.js';
import { generateGradesCsv, GradeExportRow } from '../utils/csv.js';

export interface GradeRouteOptions {
  pool: pg.Pool;
  config: ApiConfig;
}

export const gradeRoutes: FastifyPluginAsync<GradeRouteOptions> = async (app, options) => {
  const { pool } = options;

  // GET /api/classrooms/:id/grades/csv (Lecturer owner only - US-06)
  app.get('/classrooms/:id/grades/csv', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền xuất bảng điểm' });
    }

    const { id: classroomId } = request.params as { id: string };
    const classRes = await pool.query('SELECT lecturer_id, name FROM classrooms WHERE id = $1', [
      classroomId,
    ]);
    if (classRes.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy lớp học' });
    }
    if (classRes.rows[0].lecturer_id !== user.id) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu lớp học này' });
    }

    const { assignmentId } = request.query as { assignmentId?: string };

    let sql = `
      SELECT e.student_code as "studentCode",
             u.full_name as "fullName",
             u.email,
             a.title as "assignmentTitle",
             -- Highest score from completed submissions before deadline
             MAX(CASE WHEN s.status = 'COMPLETED' AND s.is_late = false THEN s.score ELSE NULL END) as score,
             -- Mark late if any submission for this assignment was late
             BOOL_OR(COALESCE(s.is_late, false)) as "hasLate"
      FROM classroom_enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN assignments a ON a.classroom_id = e.classroom_id
      LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = e.student_id
      WHERE e.classroom_id = $1
    `;

    const params: any[] = [classroomId];
    if (assignmentId) {
      sql += ' AND a.id = $2';
      params.push(assignmentId);
    }

    sql +=
      ' GROUP BY e.student_code, u.full_name, u.email, a.id, a.title ORDER BY e.student_code ASC, a.title ASC';

    const res = await pool.query(sql, params);

    const rows: GradeExportRow[] = res.rows.map((r) => ({
      studentCode: r.studentCode,
      fullName: r.fullName,
      email: r.email,
      assignmentTitle: r.assignmentTitle,
      score: r.score !== null ? Number(r.score) : null,
      isLate: Boolean(r.hasLate),
    }));

    const csvOutput = generateGradesCsv(rows);

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="grades_${classroomId}.csv"`);
    return reply.code(200).send(csvOutput);
  });
};
