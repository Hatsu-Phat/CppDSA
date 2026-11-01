'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import TemplateEditor from '@/components/TemplateEditor';
import FreeModeEditor from '@/components/FreeModeEditor';
import SubmissionResultCard, { SubmissionData } from '@/components/SubmissionResultCard';
import SubmissionHistoryTable from '@/components/SubmissionHistoryTable';

interface SampleTest {
  id: string;
  order_index?: number;
  input_data: string;
  expected_output: string;
}

interface AssignmentDetails {
  id: string;
  classroom_id: string;
  title: string;
  description: string | null;
  mode: 'TEMPLATE' | 'FREE';
  time_limit_ms: number;
  memory_limit_mb: number;
  deadline: string;
  template_code?: string;
  entry_point_spec?: any;
  sampleTests?: SampleTest[];
}

export default function StudentAssignmentPage() {
  const params = useParams();
  const assignmentId = params?.id as string;

  const [assignment, setAssignment] = useState<AssignmentDetails | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);
  const [activeSubmission, setActiveSubmission] = useState<SubmissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (isMountedRef.current) {
      setPolling(false);
    }
  }, []);

  // Fetch assignment submissions list
  const fetchSubmissions = useCallback(async () => {
    if (!assignmentId) return;
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/submissions`);
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          setSubmissions(data.submissions || []);
        }
      }
    } catch {
      // Ignore network errors on background poll
    }
  }, [assignmentId]);

  // Poll single submission status
  const startPollingSubmission = useCallback(
    (submissionId: string) => {
      stopPolling();
      setPolling(true);

      const pollFn = async () => {
        try {
          const res = await fetch(`/api/submissions/${submissionId}`);
          if (!res.ok) return;

          const data = await res.json();
          const sub = data.submission as SubmissionData;
          if (!isMountedRef.current) return;

          setActiveSubmission(sub);

          if (sub.status === 'COMPLETED' || sub.status === 'SYSTEM_ERROR') {
            stopPolling();
            fetchSubmissions();
          }
        } catch {
          // Ignore transient network errors
        }
      };

      // Immediate first check
      pollFn();

      // Recurring check every 2 seconds
      pollTimerRef.current = setInterval(pollFn, 2000);
    },
    [stopPolling, fetchSubmissions]
  );

  // Load specific submission details on demand (e.g. from history table)
  const handleSelectSubmission = async (id: string) => {
    try {
      const res = await fetch(`/api/submissions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveSubmission(data.submission);
        // If not completed, resume polling
        if (data.submission.status === 'PENDING' || data.submission.status === 'RUNNING') {
          startPollingSubmission(id);
        } else {
          stopPolling();
        }
      }
    } catch {
      // Ignore
    }
  };

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;

    async function loadData() {
      if (!assignmentId) return;
      try {
        setLoading(true);
        const [assignRes, subsRes] = await Promise.all([
          fetch(`/api/assignments/${assignmentId}`),
          fetch(`/api/assignments/${assignmentId}/submissions`),
        ]);

        if (!assignRes.ok) {
          throw new Error('Không thể tải thông tin bài tập');
        }
        const assignData = await assignRes.json();
        if (isMountedRef.current) {
          setAssignment(assignData.assignment);
        }

        if (subsRes.ok) {
          const subsData = await subsRes.json();
          if (isMountedRef.current) {
            const list: SubmissionData[] = subsData.submissions || [];
            setSubmissions(list);
            // If there's an ongoing submission, auto-select and poll it
            if (list.length > 0) {
              const latest = list[0];
              setActiveSubmission(latest);
              if (latest.status === 'PENDING' || latest.status === 'RUNNING') {
                startPollingSubmission(latest.id);
              }
            }
          }
        }
      } catch (err: any) {
        if (isMountedRef.current) {
          setSubmitError(err.message || 'Lỗi khi tải bài tập');
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [assignmentId, startPollingSubmission, stopPolling]);

  // Handle TEMPLATE submission
  const handleTemplateSubmit = async (payload: { regions: Record<string, string> }) => {
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/assignments/${assignmentId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 429) {
          setSubmitError('Bạn đang nộp bài quá nhanh. Vui lòng đợi.');
        } else if (res.status === 413) {
          setSubmitError('Mã nguồn vượt quá dung lượng tối đa cho phép (64 KB).');
        } else {
          setSubmitError(data?.message || 'Nộp bài thất bại. Vui lòng thử lại.');
        }
        setSubmitting(false);
        return;
      }

      const createdSub = data.submission as SubmissionData;
      setActiveSubmission(createdSub);
      startPollingSubmission(createdSub.id);
      fetchSubmissions();
    } catch {
      setSubmitError('Lỗi kết nối tới máy chủ khi nộp bài.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle FREE mode submission
  const handleFreeSubmit = async (payload: {
    studentSource: string;
    entry: {
      type: 'function' | 'method';
      name: string;
      className?: string;
    };
  }) => {
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/assignments/${assignmentId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 429) {
          setSubmitError('Bạn đang nộp bài quá nhanh. Vui lòng đợi.');
        } else if (res.status === 413) {
          setSubmitError('Mã nguồn vượt quá dung lượng tối đa cho phép (64 KB).');
        } else {
          setSubmitError(data?.message || 'Nộp bài thất bại. Vui lòng thử lại.');
        }
        setSubmitting(false);
        return;
      }

      const createdSub = data.submission as SubmissionData;
      setActiveSubmission(createdSub);
      startPollingSubmission(createdSub.id);
      fetchSubmissions();
    } catch {
      setSubmitError('Lỗi kết nối tới máy chủ khi nộp bài.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Đang tải chi tiết bài tập...</p>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="card">
        <div className="alert alert-danger" role="alert">
          {submitError || 'Không tìm thấy bài tập'}
        </div>
        <Link href="/student" className="btn btn-secondary btn-sm">
          ← Về danh sách lớp
        </Link>
      </div>
    );
  }

  const deadlineDate = new Date(assignment.deadline);
  const isPastDeadline = Date.now() > deadlineDate.getTime();

  return (
    <div>
      {/* Back button */}
      <div style={{ marginBottom: '1rem' }}>
        <Link
          href={`/student/classrooms/${assignment.classroom_id}`}
          className="btn btn-secondary btn-sm"
        >
          ← Về danh sách bài tập
        </Link>
      </div>

      {/* Assignment Header / Details Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0, color: 'var(--neutral-900)' }} data-testid="assignment-title">
            {assignment.title}
          </h2>
          <span
            className="badge badge-primary"
            data-testid="assignment-mode-badge"
            style={{
              fontSize: '0.875rem',
              backgroundColor:
                assignment.mode === 'TEMPLATE' ? 'var(--primary-light)' : 'var(--neutral-200)',
              color: assignment.mode === 'TEMPLATE' ? 'var(--primary)' : 'var(--neutral-700)',
            }}
          >
            {assignment.mode === 'TEMPLATE' ? 'Chế độ Khung mẫu (TEMPLATE)' : 'Chế độ Tự do (FREE)'}
          </span>
          {isPastDeadline && (
            <span
              className="badge badge-warning"
              data-testid="assignment-late-notice"
              style={{ fontSize: '0.85rem' }}
            >
              Hạn nộp đã qua — Bài nộp sẽ được tính là Nộp trễ
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1.5rem',
            fontSize: '0.875rem',
            color: 'var(--neutral-600)',
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong>Thời gian tối đa (TL):</strong> {assignment.time_limit_ms} ms
          </span>
          <span>
            <strong>Bộ nhớ tối đa (ML):</strong> {assignment.memory_limit_mb} MB
          </span>
          <span>
            <strong>Hạn nộp:</strong> {deadlineDate.toLocaleString('vi-VN')}
          </span>
        </div>

        {assignment.description && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--neutral-50)',
              borderRadius: 'var(--border-radius)',
              border: '1px solid var(--neutral-200)',
              marginBottom: '1rem',
              whiteSpace: 'pre-wrap',
              fontSize: '0.95rem',
            }}
          >
            {assignment.description}
          </div>
        )}

        {/* Public sample test cases (if provided by API) */}
        {assignment.sampleTests && assignment.sampleTests.length > 0 && (
          <div style={{ marginTop: '1rem' }} data-testid="sample-tests-section">
            <h5 style={{ marginBottom: '0.5rem', color: 'var(--neutral-900)' }}>
              Ví dụ minh họa (Test mẫu công khai):
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {assignment.sampleTests.map((sample, idx) => (
                <div
                  key={sample.id || idx}
                  style={{
                    border: '1px solid var(--neutral-300)',
                    borderRadius: 'var(--border-radius)',
                    padding: '0.75rem',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    Ví dụ {idx + 1}:
                  </div>
                  <div className="form-row">
                    <div className="form-col">
                      <span style={{ fontSize: '0.75rem', color: 'var(--neutral-600)' }}>
                        Đầu vào (Input):
                      </span>
                      <pre className="code-box" style={{ margin: 0, padding: '0.5rem' }}>
                        <code>{sample.input_data}</code>
                      </pre>
                    </div>
                    <div className="form-col">
                      <span style={{ fontSize: '0.75rem', color: 'var(--neutral-600)' }}>
                        Kết quả kỳ vọng (Expected Output):
                      </span>
                      <pre className="code-box" style={{ margin: 0, padding: '0.5rem' }}>
                        <code>{sample.expected_output}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Submission Error Banner */}
      {submitError && (
        <div className="alert alert-danger" data-testid="submit-error" role="alert">
          {submitError}
        </div>
      )}

      {/* Active Evaluation / Result View */}
      {activeSubmission && <SubmissionResultCard submission={activeSubmission} polling={polling} />}

      {/* Code Editor Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        {assignment.mode === 'TEMPLATE' ? (
          <TemplateEditor
            templateCode={assignment.template_code || ''}
            onSubmit={handleTemplateSubmit}
            submitting={submitting || polling}
          />
        ) : (
          <FreeModeEditor
            entryPointSpec={assignment.entry_point_spec}
            onSubmit={handleFreeSubmit}
            submitting={submitting || polling}
          />
        )}
      </div>

      {/* Submissions History Table */}
      <SubmissionHistoryTable
        submissions={submissions}
        onSelectSubmission={handleSelectSubmission}
        selectedSubmissionId={activeSubmission?.id}
      />
    </div>
  );
}
