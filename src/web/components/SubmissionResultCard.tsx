'use client';

import React from 'react';

export interface TestResultItem {
  testCaseId?: string;
  orderIndex?: number;
  verdict: string;
  executionTimeMs?: number;
  memoryUsedKb?: number;
  timeMs?: number;
  memoryKb?: number;
  // If API or caller accidentally included input or expected, they must be stripped
  inputData?: string;
  expectedOutput?: string;
  studentOutputExcerpt?: string;
}

export interface SubmissionData {
  id: string;
  assignmentId?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'SYSTEM_ERROR' | string;
  score?: number | string | null;
  passedTests?: number;
  totalTests?: number;
  isLate?: boolean;
  compileOutput?: string | null;
  createdAt?: string;
  finishedAt?: string | null;
  tests?: TestResultItem[];
}

export interface SubmissionResultCardProps {
  submission: SubmissionData | null;
  polling?: boolean;
}

export function computeOverallVerdict(submission: SubmissionData): string {
  if (submission.compileOutput) {
    return 'CE';
  }
  if (!submission.tests || submission.tests.length === 0) {
    if (submission.status === 'SYSTEM_ERROR') return 'SE';
    if (submission.status === 'COMPLETED') {
      const scoreNum = Number(submission.score ?? 0);
      return scoreNum >= 1 ? 'AC' : 'WA';
    }
    return submission.status;
  }

  const failedTest = submission.tests.find((t) => t.verdict !== 'AC');
  if (failedTest) {
    return failedTest.verdict;
  }
  return 'AC';
}

export default function SubmissionResultCard({
  submission,
  polling = false,
}: SubmissionResultCardProps) {
  if (!submission) {
    return null;
  }

  const status = submission.status;
  const isFinished = status === 'COMPLETED' || status === 'SYSTEM_ERROR';
  const overallVerdict = computeOverallVerdict(submission);

  const getVerdictBadgeClass = (verdict: string) => {
    switch (verdict.toUpperCase()) {
      case 'AC':
        return 'badge-ac';
      case 'WA':
        return 'badge-wa';
      case 'TLE':
        return 'badge-tle';
      case 'MLE':
        return 'badge-tle';
      case 'CE':
        return 'badge-ce';
      case 'RE':
        return 'badge-danger';
      case 'SE':
        return 'badge-danger';
      default:
        return 'badge-pending';
    }
  };

  const formattedScore =
    submission.score !== null && submission.score !== undefined
      ? Number(submission.score).toFixed(2)
      : '-';

  return (
    <div
      className="card"
      data-testid="submission-result-card"
      style={{
        border: '1px solid var(--neutral-300)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          borderBottom: '1px solid var(--neutral-200)',
          paddingBottom: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h4 style={{ margin: 0, color: 'var(--neutral-900)' }}>
            Kết quả bài nộp{' '}
            <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--neutral-600)' }}>
              (ID: {submission.id.substring(0, 8)}...)
            </span>
          </h4>
          {submission.createdAt && (
            <span style={{ fontSize: '0.8rem', color: 'var(--neutral-600)' }}>
              Nộp lúc: {new Date(submission.createdAt).toLocaleString('vi-VN')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {submission.isLate && (
            <span className="badge badge-warning" data-testid="badge-late">
              Nộp trễ
            </span>
          )}

          <span
            className={`badge ${
              status === 'COMPLETED'
                ? 'badge-completed'
                : status === 'SYSTEM_ERROR'
                  ? 'badge-wa'
                  : 'badge-pending'
            }`}
            data-testid="submission-status"
          >
            {status === 'PENDING' && (polling ? 'Đang chờ chấm (PENDING)...' : 'PENDING')}
            {status === 'RUNNING' && (polling ? 'Đang chấm bài (RUNNING)...' : 'RUNNING')}
            {status === 'COMPLETED' && 'Đã chấm xong (COMPLETED)'}
            {status === 'SYSTEM_ERROR' && 'Lỗi hệ thống (SYSTEM_ERROR)'}
          </span>
        </div>
      </div>

      {status === 'SYSTEM_ERROR' && (
        <div className="alert alert-danger" data-testid="system-error-alert" role="alert">
          <strong>Lỗi hệ thống:</strong> Hệ thống gặp sự cố trong quá trình chấm bài. Vui lòng thử
          lại sau ít phút.
        </div>
      )}

      {isFinished && status !== 'SYSTEM_ERROR' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '1rem',
            padding: '1rem',
            backgroundColor: 'var(--neutral-50)',
            borderRadius: 'var(--border-radius)',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--neutral-600)' }}>Kết quả chung</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }} data-testid="submission-verdict">
              <span className={`badge ${getVerdictBadgeClass(overallVerdict)}`}>
                {overallVerdict}
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--neutral-600)' }}>Điểm số</div>
            <div
              style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}
              data-testid="submission-score"
            >
              {formattedScore}
            </div>
          </div>

          {submission.totalTests !== undefined && (
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-600)' }}>Số test đạt</div>
              <div
                style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--neutral-900)' }}
                data-testid="pass-ratio"
              >
                {submission.passedTests ?? 0} / {submission.totalTests}
              </div>
            </div>
          )}
        </div>
      )}

      {submission.compileOutput && (
        <div style={{ marginBottom: '1rem' }} data-testid="compile-output-section">
          <h5 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>
            Thông báo lỗi biên dịch (Compile Output):
          </h5>
          <pre
            className="code-box"
            data-testid="compile-output"
            style={{
              backgroundColor: '#1a1a1a',
              color: '#ff8a80',
              maxHeight: '260px',
              overflowY: 'auto',
            }}
          >
            <code>{submission.compileOutput}</code>
          </pre>
        </div>
      )}

      {submission.tests && submission.tests.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h5 style={{ marginBottom: '0.5rem', color: 'var(--neutral-900)' }}>
            Chi tiết kết quả từng bài kiểm thử ẩn:
          </h5>
          <div className="table-responsive">
            <table className="table" data-testid="test-results-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Bài kiểm thử</th>
                  <th style={{ width: '120px' }}>Kết quả</th>
                  <th>Thời gian chạy</th>
                  <th>Bộ nhớ</th>
                </tr>
              </thead>
              <tbody>
                {submission.tests.map((test, idx) => {
                  const testIndex = test.orderIndex !== undefined ? test.orderIndex + 1 : idx + 1;
                  const time = test.executionTimeMs ?? test.timeMs ?? 0;
                  const memory = test.memoryUsedKb ?? test.memoryKb ?? 0;

                  return (
                    <tr key={idx} data-testid={`test-result-row-${testIndex}`}>
                      <td style={{ fontWeight: 600 }}>Test {testIndex}</td>
                      <td>
                        <span
                          className={`badge ${getVerdictBadgeClass(test.verdict)}`}
                          data-testid={`test-verdict-${testIndex}`}
                        >
                          {test.verdict}
                        </span>
                      </td>
                      <td>{time} ms</td>
                      <td>{memory} KB</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
