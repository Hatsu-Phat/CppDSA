import { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { ApiConfig } from '../config.js';

export interface TestCaseRouteOptions {
  pool: pg.Pool;
  config: ApiConfig;
}

export const testCaseRoutes: FastifyPluginAsync<TestCaseRouteOptions> = async (app, options) => {
  const { pool, config } = options;

  const verifyAssignmentOwner = async (assignmentId: string, userId: string) => {
    const res = await pool.query(
      `SELECT a.id, c.lecturer_id
       FROM assignments a
       JOIN classrooms c ON a.classroom_id = c.id
       WHERE a.id = $1`,
      [assignmentId]
    );
    if (res.rowCount === 0) return { exists: false, isOwner: false };
    return { exists: true, isOwner: res.rows[0].lecturer_id === userId };
  };

  const verifyTestCaseOwner = async (testId: string, userId: string) => {
    const res = await pool.query(
      `SELECT t.id, t.assignment_id, c.lecturer_id
       FROM test_cases t
       JOIN assignments a ON t.assignment_id = a.id
       JOIN classrooms c ON a.classroom_id = c.id
       WHERE t.id = $1`,
      [testId]
    );
    if (res.rowCount === 0) return { exists: false, isOwner: false };
    return { exists: true, isOwner: res.rows[0].lecturer_id === userId };
  };

  // POST /api/assignments/:id/tests (Lecturer owner only)
  app.post('/assignments/:id/tests', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền thêm test case' });
    }

    const { id: assignmentId } = request.params as { id: string };
    const { exists, isOwner } = await verifyAssignmentOwner(assignmentId, user.id);
    if (!exists)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    if (!isOwner)
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });

    const body = request.body as {
      inputData?: string;
      expectedOutput?: string;
      isHidden?: boolean;
      isSample?: boolean;
      orderIndex?: number;
    };

    if (body.inputData === undefined || body.expectedOutput === undefined) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'inputData và expectedOutput là bắt buộc',
      });
    }

    const inputBytes = Buffer.byteLength(body.inputData, 'utf8');
    const expectedBytes = Buffer.byteLength(body.expectedOutput, 'utf8');

    if (inputBytes > config.maxTestCaseBytes || expectedBytes > config.maxTestCaseBytes) {
      return reply.code(413).send({
        error: 'PAYLOAD_TOO_LARGE',
        message: `Dữ liệu test case vượt quá giới hạn tối đa (${config.maxTestCaseBytes} bytes)`,
      });
    }

    const isHidden = body.isHidden !== false;
    if (isHidden) {
      const countRes = await pool.query(
        'SELECT COUNT(*) FROM test_cases WHERE assignment_id = $1 AND is_hidden = true',
        [assignmentId]
      );
      const currentHiddenCount = Number(countRes.rows[0].count);
      if (currentHiddenCount >= config.maxTestCasesPerAssignment) {
        return reply.code(400).send({
          error: 'TOO_MANY_TEST_CASES',
          message: `Bài tập đã đạt giới hạn tối đa ${config.maxTestCasesPerAssignment} test case ẩn`,
        });
      }
    }

    let orderIndex = body.orderIndex;
    if (orderIndex === undefined) {
      const maxOrderRes = await pool.query(
        'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM test_cases WHERE assignment_id = $1',
        [assignmentId]
      );
      orderIndex = Number(maxOrderRes.rows[0].next_order);
    }

    const res = await pool.query(
      `INSERT INTO test_cases (assignment_id, order_index, input_data, expected_output, is_hidden, is_sample)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        assignmentId,
        orderIndex,
        body.inputData,
        body.expectedOutput,
        isHidden,
        body.isSample || false,
      ]
    );

    return reply.code(201).send({ testCase: res.rows[0] });
  });

  // POST /api/assignments/:id/tests/bulk (Lecturer owner only)
  app.post('/assignments/:id/tests/bulk', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền thêm test case' });
    }

    const { id: assignmentId } = request.params as { id: string };
    const { exists, isOwner } = await verifyAssignmentOwner(assignmentId, user.id);
    if (!exists) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    }
    if (!isOwner) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });
    }

    const body = request.body as {
      tests?: Array<{
        inputData?: string;
        expectedOutput?: string;
        isHidden?: boolean;
        isSample?: boolean;
      }>;
      replace?: boolean;
    };

    if (!body || !Array.isArray(body.tests)) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'tests phải là một mảng',
      });
    }

    // Validate each test case
    for (const t of body.tests) {
      if (t.inputData === undefined || t.expectedOutput === undefined) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'inputData và expectedOutput là bắt buộc cho mỗi test case',
        });
      }

      const inputBytes = Buffer.byteLength(String(t.inputData), 'utf8');
      const expectedBytes = Buffer.byteLength(String(t.expectedOutput), 'utf8');
      if (inputBytes > config.maxTestCaseBytes || expectedBytes > config.maxTestCaseBytes) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: `Dữ liệu test case vượt quá giới hạn tối đa (${config.maxTestCaseBytes} bytes)`,
        });
      }
    }

    // Check count limit
    const replace = Boolean(body.replace);
    if (replace) {
      if (body.tests.length > config.maxTestCasesPerAssignment) {
        return reply.code(400).send({
          error: 'TOO_MANY_TEST_CASES',
          message: `Số lượng test case vượt quá giới hạn tối đa ${config.maxTestCasesPerAssignment}`,
        });
      }
    } else {
      const countRes = await pool.query(
        'SELECT COUNT(*) FROM test_cases WHERE assignment_id = $1',
        [assignmentId]
      );
      const currentCount = Number(countRes.rows[0].count);
      if (currentCount + body.tests.length > config.maxTestCasesPerAssignment) {
        return reply.code(400).send({
          error: 'TOO_MANY_TEST_CASES',
          message: `Tổng số test case sau khi thêm (${currentCount + body.tests.length}) vượt quá giới hạn tối đa ${config.maxTestCasesPerAssignment}`,
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (replace) {
        await client.query('DELETE FROM test_cases WHERE assignment_id = $1', [assignmentId]);
      }

      const maxOrderRes = await client.query(
        'SELECT COALESCE(MAX(order_index), 0) as max_order FROM test_cases WHERE assignment_id = $1',
        [assignmentId]
      );
      let currentOrder = Number(maxOrderRes.rows[0].max_order);

      const inserted: any[] = [];
      for (const t of body.tests) {
        currentOrder++;
        const isHidden = t.isHidden !== false;
        const isSample = Boolean(t.isSample);
        const res = await client.query(
          `INSERT INTO test_cases (assignment_id, order_index, input_data, expected_output, is_hidden, is_sample)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            assignmentId,
            currentOrder,
            String(t.inputData),
            String(t.expectedOutput),
            isHidden,
            isSample,
          ]
        );
        inserted.push(res.rows[0]);
      }

      await client.query('COMMIT');
      return reply.code(201).send({ testCases: inserted, count: inserted.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /api/assignments/:id/tests (Lecturer owner only)
  app.get('/assignments/:id/tests', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Chỉ giảng viên mới có quyền xem toàn bộ test case',
      });
    }

    const { id: assignmentId } = request.params as { id: string };
    const { exists, isOwner } = await verifyAssignmentOwner(assignmentId, user.id);
    if (!exists)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy bài tập' });
    if (!isOwner)
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu bài tập này' });

    const res = await pool.query(
      'SELECT * FROM test_cases WHERE assignment_id = $1 ORDER BY order_index ASC',
      [assignmentId]
    );

    return reply.code(200).send({ testCases: res.rows });
  });

  // PUT /api/tests/:id (Lecturer owner only)
  app.put('/tests/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền sửa test case' });
    }

    const { id } = request.params as { id: string };
    const { exists, isOwner } = await verifyTestCaseOwner(id, user.id);
    if (!exists)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy test case' });
    if (!isOwner)
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu test case này' });

    const body = request.body as any;

    if (
      body.inputData !== undefined &&
      Buffer.byteLength(body.inputData, 'utf8') > config.maxTestCaseBytes
    ) {
      return reply.code(413).send({
        error: 'PAYLOAD_TOO_LARGE',
        message: `inputData vượt quá giới hạn tối đa (${config.maxTestCaseBytes} bytes)`,
      });
    }
    if (
      body.expectedOutput !== undefined &&
      Buffer.byteLength(body.expectedOutput, 'utf8') > config.maxTestCaseBytes
    ) {
      return reply.code(413).send({
        error: 'PAYLOAD_TOO_LARGE',
        message: `expectedOutput vượt quá giới hạn tối đa (${config.maxTestCaseBytes} bytes)`,
      });
    }

    const updated = await pool.query(
      `UPDATE test_cases
       SET input_data = COALESCE($1, input_data),
           expected_output = COALESCE($2, expected_output),
           is_hidden = COALESCE($3, is_hidden),
           is_sample = COALESCE($4, is_sample),
           order_index = COALESCE($5, order_index)
       WHERE id = $6 RETURNING *`,
      [body.inputData, body.expectedOutput, body.isHidden, body.isSample, body.orderIndex, id]
    );

    return reply.code(200).send({ testCase: updated.rows[0] });
  });

  // DELETE /api/tests/:id (Lecturer owner only)
  app.delete('/tests/:id', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' });
    }
    if (user.role !== 'LECTURER') {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Chỉ giảng viên mới có quyền xóa test case' });
    }

    const { id } = request.params as { id: string };
    const { exists, isOwner } = await verifyTestCaseOwner(id, user.id);
    if (!exists)
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Không tìm thấy test case' });
    if (!isOwner)
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: 'Bạn không sở hữu test case này' });

    await pool.query('DELETE FROM test_cases WHERE id = $1', [id]);
    return reply.code(200).send({ message: 'Đã xóa test case thành công' });
  });
};
