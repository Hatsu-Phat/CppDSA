import { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { ApiConfig } from '../config.js';
import {
  comparePassword,
  generateSessionToken,
  hashPassword,
  hashToken,
} from '../utils/security.js';

export interface AuthRouteOptions {
  pool: pg.Pool;
  config: ApiConfig;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  const { pool, config } = options;

  // POST /api/auth/login
  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60 * 1000,
          keyGenerator: (req) => req.ip,
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'Đăng nhập quá 10 lần trong 1 phút. Vui lòng thử lại sau.',
          }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = (request.body as { email?: string; password?: string }) || {};

      if (!email || !password) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'Email và mật khẩu là bắt buộc',
        });
      }

      const res = await pool.query(
        'SELECT id, email, password_hash, full_name, role, must_change_password FROM users WHERE email = $1',
        [email.trim().toLowerCase()]
      );

      if (res.rowCount === 0) {
        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          message: 'Email hoặc mật khẩu không chính xác',
        });
      }

      const user = res.rows[0];
      const match = await comparePassword(password, user.password_hash);
      if (!match) {
        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          message: 'Email hoặc mật khẩu không chính xác',
        });
      }

      // Generate session token (32 bytes random)
      const token = generateSessionToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours

      await pool.query(
        'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt]
      );

      reply.setCookie('sid', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
        expires: expiresAt,
      });

      return reply.code(200).send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          mustChangePassword: user.must_change_password,
        },
      });
    }
  );

  // POST /api/auth/logout
  app.post('/logout', async (request, reply) => {
    const rawSid = request.cookies.sid;
    if (rawSid) {
      const tokenHash = hashToken(rawSid);
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    }

    reply.clearCookie('sid', { path: '/' });
    return reply.code(200).send({ message: 'Đăng xuất thành công' });
  });

  // GET /api/auth/me
  app.get('/me', async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Chưa đăng nhập',
      });
    }

    return reply.code(200).send({
      user: request.user,
    });
  });

  // POST /api/auth/change-password
  app.post('/change-password', async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Chưa đăng nhập',
      });
    }

    const { oldPassword, newPassword } =
      (request.body as { oldPassword?: string; newPassword?: string }) || {};

    if (!oldPassword || !newPassword) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'Mật khẩu cũ và mật khẩu mới là bắt buộc',
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự',
      });
    }

    const res = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
      request.user.id,
    ]);

    if (res.rowCount === 0) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Người dùng không tồn tại' });
    }

    const match = await comparePassword(oldPassword, res.rows[0].password_hash);
    if (!match) {
      return reply.code(400).send({
        error: 'INVALID_OLD_PASSWORD',
        message: 'Mật khẩu cũ không chính xác',
      });
    }

    const newHash = await hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [newHash, request.user.id]
    );

    return reply.code(200).send({ message: 'Đổi mật khẩu thành công' });
  });
};
