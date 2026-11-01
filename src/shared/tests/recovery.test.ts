import { describe, it, expect } from 'vitest';
import { decideRecovery, SubmissionForRecovery } from '../src/index';

describe('decideRecovery (PROJECT_PLAN §3.4)', () => {
  const baseNow = new Date('2026-11-01T10:00:00Z');

  it('returns NONE if status is COMPLETED even after 10 minutes', () => {
    const sub: SubmissionForRecovery = {
      id: 'sub-1',
      status: 'COMPLETED',
      updatedAt: new Date(baseNow.getTime() - 10 * 60 * 1000),
    };
    expect(decideRecovery(sub, baseNow)).toEqual({ action: 'NONE' });
  });

  it('returns NONE if status is SYSTEM_ERROR', () => {
    const sub: SubmissionForRecovery = {
      id: 'sub-2',
      status: 'SYSTEM_ERROR',
      updatedAt: new Date(baseNow.getTime() - 10 * 60 * 1000),
    };
    expect(decideRecovery(sub, baseNow)).toEqual({ action: 'NONE' });
  });

  it('returns NONE if status is PENDING and elapsed time <= 2 minutes', () => {
    const sub: SubmissionForRecovery = {
      id: 'sub-3',
      status: 'PENDING',
      updatedAt: new Date(baseNow.getTime() - 119 * 1000), // 119s
    };
    expect(decideRecovery(sub, baseNow)).toEqual({ action: 'NONE' });
  });

  it('returns NONE if exactly 2 minutes (120,000ms) has passed', () => {
    const sub: SubmissionForRecovery = {
      id: 'sub-4',
      status: 'RUNNING',
      updatedAt: new Date(baseNow.getTime() - 120 * 1000),
    };
    expect(decideRecovery(sub, baseNow)).toEqual({ action: 'NONE' });
  });

  it('returns RETRY with retryCount: 1 when PENDING for > 2 min and retryCount is undefined/0', () => {
    const sub: SubmissionForRecovery = {
      id: 'sub-5',
      status: 'PENDING',
      updatedAt: new Date(baseNow.getTime() - 121 * 1000),
    };
    expect(decideRecovery(sub, baseNow)).toEqual({ action: 'RETRY', retryCount: 1 });
  });

  it('returns RETRY with retryCount: 2 when RUNNING for > 2 min and retryCount is 1', () => {
    const sub: SubmissionForRecovery = {
      id: 'sub-6',
      status: 'RUNNING',
      updatedAt: new Date(baseNow.getTime() - 150 * 1000),
      retryCount: 1,
    };
    expect(decideRecovery(sub, baseNow)).toEqual({ action: 'RETRY', retryCount: 2 });
  });

  it('returns MARK_SYSTEM_ERROR when elapsed > 2 min and already retried 2 times', () => {
    const sub: SubmissionForRecovery = {
      id: 'sub-7',
      status: 'RUNNING',
      updatedAt: new Date(baseNow.getTime() - 150 * 1000),
      retryCount: 2,
    };
    expect(decideRecovery(sub, baseNow)).toEqual({ action: 'MARK_SYSTEM_ERROR' });
  });

  it('works with timestamps passed as ISO strings', () => {
    const sub: SubmissionForRecovery = {
      id: 'sub-8',
      status: 'PENDING',
      updatedAt: '2026-11-01T09:55:00Z', // 5 minutes earlier
    };
    expect(decideRecovery(sub, '2026-11-01T10:00:00Z')).toEqual({
      action: 'RETRY',
      retryCount: 1,
    });
  });
});
