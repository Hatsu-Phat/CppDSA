'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface SubmissionDetail {
  id: string;
  assignmentId: string;
  studentId: string;
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

export default function SubmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params?.id as string;

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSubmission() {
      try {
        const res = await fetch(`/api/submissions/${submissionId}`);
        if (!res.ok) throw new Error('Không tìm thấy bài nộp');
        const data = await res.json();
        setSubmission(data.submission);
      } catch (err: any) {
        setError(err.message || 'Lỗi khi tải chi tiết bài nộp');
      } finally {
        setLoading(false);
      }
    }

    if (submissionId) {
      fetchSubmission();
    }
  }, [submissionId]);

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

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h2>Chi tiết bài nộp #{submission.id.slice(0, 8)}</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.back()}>
          ← Quay lại
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          <div>
            <strong>Trạng thái:</strong> {submission.status}
          </div>
          <div>
            <strong>Điểm số:</strong>{' '}
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              {submission.score !== null ? Number(submission.score).toFixed(2) : '—'}
            </span>
          </div>
          <div>
            <strong>Test đạt:</strong> {submission.passedTests} / {submission.totalTests}
          </div>
          <div>
            <strong>Hạn nộp:</strong> {submission.isLate ? 'Nộp trễ' : 'Đúng hạn'}
          </div>
          <div>
            <strong>Thời gian nộp:</strong> {new Date(submission.createdAt).toLocaleString('vi-VN')}
          </div>
        </div>

        {submission.compileOutput && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>
              Lỗi biên dịch (Compile Output):
            </h4>
            <pre className="code-box">{submission.compileOutput}</pre>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: 'var(--neutral-700)', marginBottom: '0.5rem' }}>
            Mã nguồn sinh viên nộp:
          </h4>
          <pre className="code-box">{submission.submittedCode}</pre>
        </div>

        <div>
          <h4 style={{ color: 'var(--neutral-700)', marginBottom: '0.75rem' }}>
            Kết quả từng test ẩn:
          </h4>
          <table className="table">
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
                <tr key={t.testCaseId || idx}>
                  <td>
                    <strong>Test {t.orderIndex !== undefined ? t.orderIndex : idx + 1}</strong>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        t.verdict === 'AC'
                          ? 'badge-ac'
                          : t.verdict === 'WA'
                            ? 'badge-wa'
                            : t.verdict === 'TLE'
                              ? 'badge-tle'
                              : 'badge-ce'
                      }`}
                    >
                      {t.verdict}
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
  );
}
