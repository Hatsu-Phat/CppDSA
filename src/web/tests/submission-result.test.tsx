import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubmissionResultCard, { SubmissionData } from '../components/SubmissionResultCard';

describe('SubmissionResultCard Component', () => {
  it('renders score, verdict, execution time, and memory for completed tests', () => {
    const mockSubmission: SubmissionData = {
      id: 'sub-12345678-abcd',
      status: 'COMPLETED',
      score: 1.0,
      passedTests: 2,
      totalTests: 2,
      tests: [
        {
          orderIndex: 0,
          verdict: 'AC',
          executionTimeMs: 15,
          memoryUsedKb: 2048,
        },
        {
          orderIndex: 1,
          verdict: 'AC',
          executionTimeMs: 22,
          memoryUsedKb: 2100,
        },
      ],
    };

    render(<SubmissionResultCard submission={mockSubmission} />);

    expect(screen.getByTestId('submission-score').textContent).toBe('1.00');
    expect(screen.getByTestId('submission-verdict').textContent).toBe('AC');
    expect(screen.getByTestId('test-verdict-1').textContent).toBe('AC');
    expect(screen.getByTestId('test-verdict-2').textContent).toBe('AC');
    expect(screen.getByText('15 ms')).toBeDefined();
    expect(screen.getByText('2048 KB')).toBeDefined();
  });

  it('NEVER renders inputData, expectedOutput, or excerpts even if present in test object (AC-US-15-3)', () => {
    const sensitiveDataSubmission: SubmissionData = {
      id: 'sub-security-check',
      status: 'COMPLETED',
      score: 0.5,
      passedTests: 1,
      totalTests: 2,
      tests: [
        {
          orderIndex: 0,
          verdict: 'AC',
          executionTimeMs: 10,
          memoryUsedKb: 1024,
          // Malicious / leaked server data that MUST NOT be rendered
          inputData: 'HIDDEN_INPUT_DATA_SECRET_999',
          expectedOutput: 'HIDDEN_EXPECTED_DATA_SECRET_888',
          studentOutputExcerpt: 'SECRET_STUDENT_EXCERPT_777',
        },
        {
          orderIndex: 1,
          verdict: 'WA',
          executionTimeMs: 12,
          memoryUsedKb: 1050,
          inputData: 'ANOTHER_HIDDEN_INPUT_CASE',
          expectedOutput: 'ANOTHER_HIDDEN_EXPECTED_CASE',
        },
      ],
    };

    render(<SubmissionResultCard submission={sensitiveDataSubmission} />);

    // Ensure hidden test inputs and expected outputs are completely absent from DOM
    expect(screen.queryByText(/HIDDEN_INPUT_DATA_SECRET_999/)).toBeNull();
    expect(screen.queryByText(/HIDDEN_EXPECTED_DATA_SECRET_888/)).toBeNull();
    expect(screen.queryByText(/SECRET_STUDENT_EXCERPT_777/)).toBeNull();
    expect(screen.queryByText(/ANOTHER_HIDDEN_INPUT_CASE/)).toBeNull();
    expect(screen.queryByText(/ANOTHER_HIDDEN_EXPECTED_CASE/)).toBeNull();
  });

  it('renders compilation error message in code box when CE occurs', () => {
    const ceSubmission: SubmissionData = {
      id: 'sub-ce-123',
      status: 'COMPLETED',
      score: 0,
      compileOutput: 'solution.cpp:10:5: error: syntax error before semicolon',
      tests: [],
    };

    render(<SubmissionResultCard submission={ceSubmission} />);

    expect(screen.getByTestId('submission-verdict').textContent).toBe('CE');
    const compilePre = screen.getByTestId('compile-output');
    expect(compilePre.textContent).toContain('syntax error before semicolon');
  });

  it('renders friendly error message and retry prompt on SYSTEM_ERROR (AC-US-14-2)', () => {
    const seSubmission: SubmissionData = {
      id: 'sub-se-123',
      status: 'SYSTEM_ERROR',
      score: 0,
    };

    render(<SubmissionResultCard submission={seSubmission} />);

    const alert = screen.getByTestId('system-error-alert');
    expect(alert.textContent).toContain('Hệ thống gặp sự cố trong quá trình chấm bài');
    expect(alert.textContent).toContain('Vui lòng thử lại sau');
  });

  it('renders "Nộp trễ" badge when isLate is true (AC-US-17-2)', () => {
    const lateSubmission: SubmissionData = {
      id: 'sub-late-123',
      status: 'COMPLETED',
      score: 1.0,
      isLate: true,
      tests: [
        {
          orderIndex: 0,
          verdict: 'AC',
          executionTimeMs: 10,
          memoryUsedKb: 1000,
        },
      ],
    };

    render(<SubmissionResultCard submission={lateSubmission} />);

    const lateBadge = screen.getByTestId('badge-late');
    expect(lateBadge).toBeDefined();
    expect(lateBadge.textContent).toContain('Nộp trễ');
  });
});
