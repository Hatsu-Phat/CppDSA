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
  const [activeTab, setActiveTab] = useState<'work' | 'history'>('work');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (isMountedRef.current) {
      setPolling(false);
    }
  }, []);

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
      // Ignore background fetch error
    }
  }, [assignmentId]);

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
          // Ignore transient poll error
        }
      };

      pollFn();
      pollTimerRef.current = setInterval(pollFn, 2000);
    },
    [stopPolling, fetchSubmissions]
  );

  const handleSelectSubmission = async (id: string) => {
    try {
      const res = await fetch(`/api/submissions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveSubmission(data.submission);
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

  const handleCopy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey(null);
      }, 2000);
    } catch {
      // ignore
    }
  };

  // Submit handler: automatically switches to history tab after submit
  const handleGenericSubmit = async (payload: any) => {
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
      // Auto switch to history tab
      setActiveTab('history');
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
  const pendingCount = submissions.filter(
    (s) => s.status === 'PENDING' || s.status === 'RUNNING'
  ).length;

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

      {/* Assignment Header Card */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.5rem' }}
            data-testid="assignment-title"
          >
            {assignment.title}
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="chip" data-testid="chip-tl">
              <strong>TL:</strong> {assignment.time_limit_ms} ms
            </span>
            <span className="chip" data-testid="chip-ml">
              <strong>ML:</strong> {assignment.memory_limit_mb} MB
            </span>
            <span className="chip" data-testid="chip-deadline">
              <strong>Hạn:</strong> {deadlineDate.toLocaleString('vi-VN')}
            </span>
            {isPastDeadline && (
              <span className="badge badge-warning" data-testid="assignment-late-notice">
                Đã quá hạn
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="tabs" style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          className={`tab-item ${activeTab === 'work' ? 'active' : ''}`}
          onClick={() => setActiveTab('work')}
          data-testid="tab-work"
        >
          Làm bài
        </button>
        <button
          type="button"
          className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          data-testid="tab-history"
        >
          Lịch sử nộp
          {pendingCount > 0 && (
            <span className="badge badge-pending" style={{ marginLeft: '4px', fontSize: '0.7rem' }}>
              {pendingCount} đang chấm
            </span>
          )}
        </button>
      </div>

      {submitError && (
        <div className="alert alert-danger" data-testid="submit-error" role="alert">
          {submitError}
        </div>
      )}

      {/* Tab 1: Work */}
      {activeTab === 'work' && (
        <div>
          {/* Problem description & public samples */}
          {assignment.description && (
            <div
              className="card"
              style={{
                marginBottom: '1.25rem',
                whiteSpace: 'pre-wrap',
                fontSize: '0.95rem',
                lineHeight: 1.6,
              }}
              data-testid="assignment-description"
            >
              <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-main)', fontSize: '1rem' }}>
                Mô tả yêu cầu
              </h4>
              {assignment.description}
            </div>
          )}

          {/* Public Samples */}
          {assignment.sampleTests && assignment.sampleTests.length > 0 && (
            <div
              className="card"
              style={{ marginBottom: '1.25rem' }}
              data-testid="sample-tests-section"
            >
              <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-main)', fontSize: '1rem' }}>
                Ví dụ mẫu
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {assignment.sampleTests.map((sample, idx) => (
                  <div
                    key={sample.id || idx}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--border-radius)',
                      padding: '0.75rem',
                      background: 'var(--bg-page)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      Ví dụ {idx + 1}
                    </div>
                    <div className="form-row">
                      <div className="form-col">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Đầu vào (Input):
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                            onClick={() => handleCopy(sample.input_data, `in-${idx}`)}
                          >
                            {copiedKey === `in-${idx}` ? 'Đã chép!' : 'Sao chép'}
                          </button>
                        </div>
                        <pre
                          className="code-box"
                          style={{ margin: 0, padding: '0.5rem', maxHeight: '120px' }}
                        >
                          <code>{sample.input_data}</code>
                        </pre>
                      </div>

                      <div className="form-col">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Kết quả kỳ vọng (Expected Output):
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                            onClick={() => handleCopy(sample.expected_output, `out-${idx}`)}
                          >
                            {copiedKey === `out-${idx}` ? 'Đã chép!' : 'Sao chép'}
                          </button>
                        </div>
                        <pre
                          className="code-box"
                          style={{ margin: 0, padding: '0.5rem', maxHeight: '120px' }}
                        >
                          <code>{sample.expected_output}</code>
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Editor */}
          <div className="card">
            {assignment.mode === 'TEMPLATE' ? (
              <TemplateEditor
                templateCode={assignment.template_code || ''}
                onSubmit={handleGenericSubmit}
                submitting={submitting || polling}
              />
            ) : (
              <FreeModeEditor onSubmit={handleGenericSubmit} submitting={submitting || polling} />
            )}
          </div>
        </div>
      )}

      {/* Tab 2: History */}
      {activeTab === 'history' && (
        <div>
          {/* Active / Selected submission result */}
          {activeSubmission && (
            <SubmissionResultCard submission={activeSubmission} polling={polling} />
          )}

          {/* History list */}
          <SubmissionHistoryTable
            submissions={submissions}
            onSelectSubmission={handleSelectSubmission}
            selectedSubmissionId={activeSubmission?.id}
          />
        </div>
      )}
    </div>
  );
}
