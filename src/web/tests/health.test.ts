import { describe, it, expect } from 'vitest';
import { GET } from '../app/api/health/route';

describe('Web Health route (/api/health)', () => {
  it('returns 200 with status ok', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: 'ok' });
  });
});
