'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getVerdictLabel, getVerdictBadgeClass } from '@/components/SubmissionResultCard';

interface SubmissionDetail {
  id: string;
  assignmentId: string;
  studentId: string;
  studentCode?: string;
  studentName?: string;
  submittedCode: string;
  entryPointDeclaration?: any;
  status: string;
  score: number | null;
  passedTests: number;
  totalTests: number;
  isLate: boolean;
  compileOutput: string | null;
  createdAt: string;
  tests: Array<{
    testCaseId: string;
    orderIndex: number;
    verdict: string;
    executionTimeMs: number;
    memoryUsedKb: number;
    studentOutputExcerpt: string | null;
  }>;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'Đã chấm xong';
    case 'PENDING':
      return 'Đang chờ chấm';
    case 'RUNNING':
      return 'Đang chấm bài';
    case 'SYSTEM_ERROR':
      return 'Lỗi hệ thống';
    default:
      return status;
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'badge-ac';
    case 'SYSTEM_ERROR':
      return 'badge-wa';
    case 'RUNNING':
    case 'PENDING':
      return 'badge-pending';
    default:
      return 'badge-pending';
  }
}

function renderSubmittedCode(codeStr: string) {
  try {
    const trimmed = codeStr.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed);
        if (entries.length > 0) {
          return (
            <div
              data-testid="detail-submitted-code"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {entries.map(([regionName, content]) => (
                <div key={regionName}>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Vùng mã: <code>{regionName}</code>
                  </div>
                  <pre className="code-box" style={{ margin: 0 }}>
                    <code>{String(content)}</code>
                  </pre>
                </div>
              ))}
            </div>
          );
        }
      }
    }
  } catch {
    // Fallback to plain text
  }

  return (
    <pre className="code-box" data-testid="detail-submitted-code">
      <code>{codeStr}</code>
    </pre>
  );
}

export default function SubmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params?.id as string;

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Score edit state
  const [editScore, setEditScore] = useState<string>('0.00');
  const [savingScore, setSavingScore] = useState(false);
  const [scoreSuccess, setScoreSuccess] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // Regrade state & Poller
  const [regrading, setRegrading] = useState(false);
  const [regradeNotice, setRegradeNotice] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();

    const pollFn = async () => {
      try {
        const res = await fetch(`/api/submissions/${submissionId}`);
        if (!res.ok || !isMountedRef.current) return;
        const data = await res.json();
        const sub = data.submission as SubmissionDetail;
        setSubmission(sub);
        setEditScore(
          sub.score !== null && sub.score !== undefined ? Number(sub.score).toFixed(2) : '0.00'
        );

        if (sub.status === 'COMPLETED' || sub.status === 'SYSTEM_ERROR') {
          stopPolling();
          setRegradeNotice(
            `Đã chấm lại hoàn tất: Trạng thái ${getStatusLabel(sub.status)}, Điểm ${sub.score !== null ? Number(sub.score).toFixed(2) : 0}`
          );
        }
      } catch {
        // Ignore network errors
      }
    };

    pollFn();
    pollTimerRef.current = setInterval(pollFn, 2000);
  }, [submissionId, stopPolling]);

  const fetchSubmission = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/submissions/${submissionId}`);
      if (!res.ok) throw new Error('Không tìm thấy bài nộp');
      const data = await res.json();
      const sub = data.submission as SubmissionDetail;
      setSubmission(sub);
      setEditScore(
        sub.score !== null && sub.score !== undefined ? Number(sub.score).toFixed(2) : '0.00'
      );
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải chi tiết bài nộp');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    isMountedRef.current = true;
    if (submissionId) {
      fetchSubmission();
    }
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [submissionId, fetchSubmission, stopPolling]);

  // Handle Save Score
  const handleSaveScore = async (e: React.FormEvent) => {
    e.preventDefault();
    setScoreError(null);
    setScoreSuccess(null);

    const val = Number(editScore);
    if (isNaN(val) || val < 0 || val > 1) {
      setScoreError('Điểm số phải là số trong khoảng từ 0.00 đến 1.00');
      return;
    }

    setSavingScore(true);

    try {
      const res = await fetch(`/api/submissions/${submissionId}/score`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: val }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setScoreError(data?.message || 'Không thể lưu điểm mới');
        setSavingScore(false);
        return;
      }

      setScoreSuccess(`Đã lưu điểm thành công: ${val.toFixed(2)} (${(val * 100).toFixed(0)}%)`);
      if (submission) {
        setSubmission({
          ...submission,
          score: val,
        });
      }
    } catch {
      setScoreError('Lỗi kết nối khi lưu điểm');
    } finally {
      setSavingScore(false);
    }
  };

  // Handle Regrade Single Submission
  const handleRegrade = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn chấm lại bài nộp này?')) return;

    setRegrading(true);
    setRegradeNotice('Đã gửi yêu cầu chấm lại tới Grader...');

    try {
      const res = await fetch(`/api/submissions/${submissionId}/regrade`, {
        method: 'POST',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setRegradeNotice(data?.message || 'Không thể chấm lại bài nộp');
        setRegrading(false);
        return;
      }

      startPolling();
    } catch {
      setRegradeNotice('Lỗi kết nối khi gửi yêu cầu chấm lại');
    } finally {
      setRegrading(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Đang tải chi tiết bài nộp...</p>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="alert alert-danger" role="alert">
        {error || 'Không tìm thấy bài nộp'}
      </div>
    );
  }

  const numericScore = submission.score !== null ? Number(submission.score) : 0;
  const percentage = (numericScore * 100).toFixed(0);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h2>Chi tiết bài nộp #{submission.id.slice(0, 8)}</h2>
          {submission.studentCode && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Sinh viên: <strong>{submission.studentCode}</strong>{' '}
              {submission.studentName ? `(${submission.studentName})` : ''}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRegrade}
            disabled={regrading || submission.status === 'RUNNING'}
            data-testid="regrade-sub-btn"
          >
            {regrading ? 'Đang gửi...' : 'Chấm lại'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.back()}>
            ← Quay lại
          </button>
        </div>
      </div>

      {regradeNotice && (
        <div className="alert alert-info" role="alert" data-testid="regrade-notice">
          {regradeNotice}
        </div>
      )}

      {/* Overview Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            gap: '2rem',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
            fontSize: '0.95rem',
          }}
        >
          <div>
            <strong>Trạng thái:</strong>{' '}
            <span
              className={`badge ${getStatusBadgeClass(submission.status)}`}
              data-testid="submission-status"
            >
              {getStatusLabel(submission.status)}
            </span>
          </div>

          <div>
            <strong>Điểm hiện tại:</strong>{' '}
            <span
              style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--primary)' }}
              data-testid="detail-score"
            >
              {submission.score !== null ? Number(submission.score).toFixed(2) : '—'} ({percentage}
              %)
            </span>
          </div>

          <div>
            <strong>Test đạt:</strong> {submission.passedTests} / {submission.totalTests}
          </div>

          <div>
            <strong>Hạn nộp:</strong>{' '}
            {submission.isLate ? (
              <span className="badge badge-warning" data-testid="badge-late">
                Nộp trễ
              </span>
            ) : (
              <span className="badge badge-ac">Đúng hạn</span>
            )}
          </div>

          <div>
            <strong>Thời gian nộp:</strong> {new Date(submission.createdAt).toLocaleString('vi-VN')}
          </div>
        </div>

        {/* Score Editing Section */}
        <div
          style={{
            background: 'var(--bg-page)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem',
            marginBottom: '1rem',
          }}
          data-testid="score-edit-section"
        >
          <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Chỉnh sửa điểm số thủ công
          </h4>

          {scoreError && (
            <div className="alert alert-danger" role="alert" data-testid="score-error">
              {scoreError}
            </div>
          )}

          {scoreSuccess && (
            <div className="alert alert-success" role="alert" data-testid="score-success">
              {scoreSuccess}
            </div>
          )}

          <form
            onSubmit={handleSaveScore}
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label htmlFor="edit-score-input" className="form-label" style={{ margin: 0 }}>
                Điểm (thang 0.00 – 1.00):
              </label>
              <input
                id="edit-score-input"
                type="number"
                step="0.01"
                min="0"
                max="1"
                className="form-control"
                style={{ width: '100px', fontWeight: 600 }}
                value={editScore}
                onChange={(e) => setEditScore(e.target.value)}
                data-testid="edit-score-input"
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                = {(Math.min(1, Math.max(0, Number(editScore) || 0)) * 100).toFixed(0)}%
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={savingScore}
              data-testid="save-score-btn"
            >
              {savingScore ? 'Đang lưu...' : 'Lưu điểm'}
            </button>
          </form>
        </div>

        {/* Compile Output */}
        {submission.compileOutput && (
          <div style={{ marginBottom: '1.5rem' }} data-testid="compile-output-section">
            <h4 style={{ color: 'var(--verdict-wa)', marginBottom: '0.5rem' }}>
              Lỗi biên dịch (Compile Output):
            </h4>
            <pre className="code-box" data-testid="compile-output">
              <code>{submission.compileOutput}</code>
            </pre>
          </div>
        )}

        {/* Submitted Code */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Mã nguồn sinh viên nộp:
          </h4>
          {renderSubmittedCode(submission.submittedCode)}
        </div>

        {/* Test Results Table */}
        <div>
          <h4 style={{ color: 'var(--text-main)', marginBottom: '0.75rem' }}>
            Kết quả từng bài kiểm thử ẩn:
          </h4>
          <div className="table-responsive">
            <table className="table" data-testid="submission-tests-table">
              <thead>
                <tr>
                  <th>Test #</th>
                  <th>Verdict</th>
                  <th>Thời gian</th>
                  <th>Bộ nhớ</th>
                  <th>Trích đoạn kết quả</th>
                </tr>
              </thead>
              <tbody>
                {submission.tests.map((t, idx) => (
                  <tr key={t.testCaseId || idx} data-testid={`test-row-${idx}`}>
                    <td>
                      <strong>
                        Test {t.orderIndex !== undefined ? t.orderIndex + 1 : idx + 1}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={`badge ${getVerdictBadgeClass(t.verdict)}`}
                        data-testid={`verdict-${idx}`}
                      >
                        {getVerdictLabel(t.verdict)}
                      </span>
                    </td>
                    <td>{t.executionTimeMs} ms</td>
                    <td>{t.memoryUsedKb} KB</td>
                    <td>
                      <small>{t.studentOutputExcerpt || '—'}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
