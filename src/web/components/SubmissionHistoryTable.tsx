'use client';

import React from 'react';
import {
  SubmissionData,
  getVerdictBadgeClass,
  getVerdictLabel,
  computeOverallVerdict,
} from './SubmissionResultCard';

export interface SubmissionHistoryTableProps {
  submissions: SubmissionData[];
  onSelectSubmission?: (submissionId: string) => void;
  selectedSubmissionId?: string | null;
}

export default function SubmissionHistoryTable({
  submissions,
  onSelectSubmission,
  selectedSubmissionId,
}: SubmissionHistoryTableProps) {
  if (!submissions || submissions.length === 0) {
    return (
      <div
        className="card"
        style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}
        data-testid="no-submissions-msg"
      >
        Bạn chưa nộp bài lần nào cho bài tập này.
      </div>
    );
  }

  return (
    <div className="card" data-testid="submission-history">
      <h4 style={{ marginBottom: '1rem', color: 'var(--text-main)', fontSize: '1.1rem' }}>
        Lịch sử nộp bài ({submissions.length} lần)
      </h4>

      <div className="table-responsive">
        <table className="table" data-testid="history-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Lần</th>
              <th>Thời gian nộp</th>
              <th>Trạng thái / Kết quả</th>
              <th>Điểm số</th>
              <th>Số test đạt</th>
              <th>Ghi chú</th>
              <th style={{ textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((sub, idx) => {
              const attemptNumber = submissions.length - idx;
              const formattedDate = sub.createdAt
                ? new Date(sub.createdAt).toLocaleString('vi-VN')
                : '—';
              const formattedScore =
                sub.score !== null && sub.score !== undefined ? Number(sub.score).toFixed(2) : '—';
              const isSelected = selectedSubmissionId === sub.id;
              const overallVerdict = computeOverallVerdict(sub);

              return (
                <tr
                  key={sub.id}
                  data-testid={`history-row-${sub.id}`}
                  style={{
                    backgroundColor: isSelected ? 'var(--primary-light)' : 'transparent',
                    cursor: onSelectSubmission ? 'pointer' : 'default',
                  }}
                  onClick={() => onSelectSubmission?.(sub.id)}
                >
                  <td style={{ fontWeight: 600 }}>#{attemptNumber}</td>
                  <td style={{ fontSize: '0.85rem' }}>{formattedDate}</td>
                  <td>
                    {sub.status === 'COMPLETED' ? (
                      <span className={`badge ${getVerdictBadgeClass(overallVerdict)}`}>
                        {getVerdictLabel(overallVerdict)}
                      </span>
                    ) : sub.status === 'SYSTEM_ERROR' ? (
                      <span className="badge badge-wa">Lỗi hệ thống</span>
                    ) : (
                      <span className="badge badge-pending">
                        {sub.status === 'RUNNING' ? 'Đang chấm bài...' : 'Đang chờ chấm...'}
                      </span>
                    )}
                  </td>
                  <td
                    style={{ fontWeight: 600, color: 'var(--primary)' }}
                    data-testid={`history-score-${sub.id}`}
                  >
                    {formattedScore}
                  </td>
                  <td>
                    {sub.passedTests !== undefined && sub.totalTests !== undefined
                      ? `${sub.passedTests} / ${sub.totalTests}`
                      : '—'}
                  </td>
                  <td>
                    {sub.isLate && (
                      <span className="badge badge-warning" data-testid={`history-late-${sub.id}`}>
                        Nộp trễ
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSubmission?.(sub.id);
                      }}
                      data-testid={`view-submission-${sub.id}`}
                    >
                      Xem chi tiết
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
