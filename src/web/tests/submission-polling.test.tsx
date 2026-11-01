import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SubmissionPoller from '../components/SubmissionPoller';

describe('SubmissionPoller Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls /api/submissions/:id every interval until status reaches COMPLETED', async () => {
    const responses = [
      { submission: { id: 'sub-1', status: 'PENDING' } },
      { submission: { id: 'sub-1', status: 'RUNNING' } },
      {
        submission: {
          id: 'sub-1',
          status: 'COMPLETED',
          score: 1.0,
          passedTests: 1,
          totalTests: 1,
          tests: [{ orderIndex: 0, verdict: 'AC', executionTimeMs: 10, memoryUsedKb: 1000 }],
        },
      },
    ];

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      const idx = Math.min(callCount, responses.length - 1);
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(responses[idx]),
      });
    });
    global.fetch = fetchMock;

    const onFinished = vi.fn();
    render(<SubmissionPoller submissionId="sub-1" pollIntervalMs={2000} onFinished={onFinished} />);

    // Initially PENDING
    expect(screen.getByTestId('submission-status').textContent).toContain('PENDING');

    // 1st tick (+2s): calls fetch -> returns PENDING
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2nd tick (+2s): calls fetch -> returns RUNNING
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('submission-status').textContent).toContain('RUNNING');

    // 3rd tick (+2s): calls fetch -> returns COMPLETED
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('submission-status').textContent).toContain('COMPLETED');
    expect(onFinished).toHaveBeenCalledTimes(1);

    // Subsequent ticks: timer was cleared! NO more fetch calls
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops polling when status reaches SYSTEM_ERROR', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          submission: { id: 'sub-2', status: 'SYSTEM_ERROR', score: 0 },
        }),
    });
    global.fetch = fetchMock;

    const onFinished = vi.fn();
    render(<SubmissionPoller submissionId="sub-2" pollIntervalMs={2000} onFinished={onFinished} />);

    // Tick 1 -> SYSTEM_ERROR
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('submission-status').textContent).toContain('SYSTEM_ERROR');
    expect(onFinished).toHaveBeenCalledTimes(1);

    // Subsequent ticks -> no more calls
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cleans up and stops polling when unmounted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          submission: { id: 'sub-3', status: 'RUNNING' },
        }),
    });
    global.fetch = fetchMock;

    const { unmount } = render(<SubmissionPoller submissionId="sub-3" pollIntervalMs={2000} />);

    // Tick 1 (+2s)
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Unmount component
    unmount();

    // Advance time again -> no more calls after unmount
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
