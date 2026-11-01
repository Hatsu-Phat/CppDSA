import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app';

describe('API Health endpoint (/health)', () => {
  it('returns 200 with status ok and db ok when database is reachable', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    };

    const app = buildApp({ pool: mockPool });
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', db: 'ok' });
    expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns 503 with status error and db error when database query fails', async () => {
    const mockPool = {
      query: vi.fn().mockRejectedValue(new Error('Connection lost')),
    };

    const app = buildApp({ pool: mockPool });
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'error', db: 'error' });
  });
});
