import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { Writable } from 'node:stream';
import { buildApp } from '../src/app';

describe('API Security Hardening Tests (Rate Limiting & Log Redaction)', () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ '?column?': 1 }] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      release: vi.fn(),
    }),
  };

  it('enforces global IP rate limiting on /api/* routes and returns 429 in Vietnamese', async () => {
    process.env.GLOBAL_RATE_LIMIT_MAX = '5';
    const app = buildApp({ pool: mockPool as any });

    // Make 5 successful requests
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
      });
      expect(res.statusCode).toBe(200);
    }

    // 6th request should hit 429
    const limitedRes = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(limitedRes.statusCode).toBe(429);
    const body = limitedRes.json();
    expect(body.statusCode).toBe(429);
    expect(body.error).toBe('Too Many Requests');
    expect(body.message).toContain(
      'Quá nhiều yêu cầu từ địa chỉ IP của bạn. Vui lòng thử lại sau.'
    );

    delete process.env.GLOBAL_RATE_LIMIT_MAX;
  });

  it('fastify logger config redacts sensitive credentials, student code and test cases', async () => {
    const logChunks: string[] = [];
    const customStream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      },
    });

    const app = Fastify({
      logger: {
        level: 'info',
        stream: customStream,
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers["x-grader-secret"]',
            'req.headers.authorization',
            'password',
            'newPassword',
            'oldPassword',
            'token',
            'graderSecret',
            'databaseUrl',
            'DATABASE_URL',
            'submittedCode',
            'studentSource',
            'input',
            'expected',
            'actual',
          ],
          censor: '[REDACTED]',
        },
      },
    });

    app.log.info({
      password: 'super-secret-password-123',
      newPassword: 'my-new-password-456',
      token: 'jwt-token-xyz-789',
      graderSecret: 'dev-grader-secret-token',
      databaseUrl: 'postgres://user:pass@host:5432/cppdsa',
      studentSource: '#include <iostream>\nint main(){ return 0; }',
      submittedCode: '#include <bits/stdc++.h>',
      input: 'secret-test-input-data',
      expected: 'secret-expected-output-data',
      actual: 'secret-actual-output-data',
      safeField: 'visible-unredacted-data',
    });

    const logged = logChunks.join('\n');
    expect(logged).toContain('[REDACTED]');
    expect(logged).toContain('visible-unredacted-data');
    expect(logged).not.toContain('super-secret-password-123');
    expect(logged).not.toContain('my-new-password-456');
    expect(logged).not.toContain('jwt-token-xyz-789');
    expect(logged).not.toContain('dev-grader-secret-token');
    expect(logged).not.toContain('postgres://user:pass@host:5432/cppdsa');
    expect(logged).not.toContain('secret-test-input-data');
    expect(logged).not.toContain('secret-expected-output-data');
    expect(logged).not.toContain('secret-actual-output-data');
    expect(logged).not.toContain('#include <iostream>');
  });

  it('internal callback route requires X-Grader-Secret header', async () => {
    const app = buildApp({
      pool: mockPool as any,
      config: { graderSecret: 'super-secret-123' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/grader-callback',
      headers: {
        'x-grader-secret': 'wrong-secret',
      },
      payload: { submissionId: 'sub-1' },
    });

    expect(res.statusCode).toBe(401);
  });
});
