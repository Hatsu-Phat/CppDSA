import { describe, it, expect } from 'vitest';
import { buildGraderApp } from '../src/app';

describe('Grader HTTP endpoints', () => {
  const secret = 'test-grader-secret-123';

  it('GET /health returns 200 with queue stats', async () => {
    const app = buildGraderApp({ graderSecret: secret });
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.queueLength).toBe('number');
    expect(typeof body.activeJobs).toBe('number');
  });

  it('POST /jobs returns 503 if secret is not configured in grader', async () => {
    const app = buildGraderApp({ graderSecret: '' });
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: {
        'x-grader-secret': 'some-secret',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(503);
  });

  it('POST /jobs returns 401 if X-Grader-Secret header is missing or wrong', async () => {
    const app = buildGraderApp({ graderSecret: secret });
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: {
        'x-grader-secret': 'wrong-secret',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /jobs returns 400 if 0 hidden tests are supplied', async () => {
    const app = buildGraderApp({ graderSecret: secret });
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: {
        'x-grader-secret': secret,
      },
      payload: {
        submissionId: 'sub-zero-tests',
        mode: 'template',
        language: 'cpp17',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        compare: 'trim-trailing',
        hiddenTests: [],
        callbackUrl: 'http://localhost/callback',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('hiddenTests must be a non-empty array');
  });

  it('POST /jobs returns 202 and enqueues job with valid payload', async () => {
    const app = buildGraderApp({ graderSecret: secret });
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: {
        'x-grader-secret': secret,
      },
      payload: {
        submissionId: 'sub-valid-1',
        mode: 'free',
        language: 'cpp17',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        compare: 'trim-trailing',
        free: {
          harness: 'int main() { return 0; }',
          entry: { type: 'function', name: 'solve' },
          studentSource: 'int solve() { return 0; }',
        },
        hiddenTests: [{ id: '1', input: '1', expected: '1' }],
        callbackUrl: 'http://localhost/callback',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      status: 'accepted',
      submissionId: 'sub-valid-1',
    });
  });
});
