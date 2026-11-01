'use client';

import React from 'react';
import { SubmissionData } from './SubmissionResultCard';

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
        style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--neutral-600)' }}
        data-testid="no-submissions-msg"
      >
        Bạn chưa nộp bài lần nào cho bài tập này.
      </div>
    );
  }

  return (
    <div className="card" data-testid="submission-history">
      <h4 style={{ marginBottom: '1rem', color: 'var(--neutral-900)' }}>
        Lịch sử nộp bài ({submissions.length} lần)
      </h4>

      <div className="table-responsive">
        <table className="table" data-testid="history-table">
          <thead>
            <tr>
              <th>Thời gian nộp</th>
              <th>Trạng thái</th>
              <th>Điểm số</th>
              <th>Số test đạt</th>
              <th>Ghi chú</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((sub) => {
              const formattedDate = sub.createdAt
                ? new Date(sub.createdAt).toLocaleString('vi-VN')
                : '-';
              const formattedScore =
                sub.score !== null && sub.score !== undefined ? Number(sub.score).toFixed(2) : '-';
              const isSelected = selectedSubmissionId === sub.id;

              return (
                <tr
                  key={sub.id}
                  data-testid={`history-row-${sub.id}`}
                  style={{
                    backgroundColor: isSelected ? 'var(--primary-light)' : 'transparent',
                  }}
                >
                  <td style={{ fontSize: '0.85rem' }}>{formattedDate}</td>
                  <td>
                    <span
                      className={`badge ${
                        sub.status === 'COMPLETED'
                          ? 'badge-completed'
                          : sub.status === 'SYSTEM_ERROR'
                            ? 'badge-wa'
                            : 'badge-pending'
                      }`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }} data-testid={`history-score-${sub.id}`}>
                    {formattedScore}
                  </td>
                  <td>
                    {sub.passedTests !== undefined && sub.totalTests !== undefined
                      ? `${sub.passedTests} / ${sub.totalTests}`
                      : '-'}
                  </td>
                  <td>
                    {sub.isLate && (
                      <span className="badge badge-warning" data-testid={`history-late-${sub.id}`}>
                        Nộp trễ
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onSelectSubmission?.(sub.id)}
                      data-testid={`view-submission-${sub.id}`}
                    >
                      Xem kết quả
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
