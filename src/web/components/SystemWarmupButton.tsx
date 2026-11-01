'use client';

import React, { useState } from 'react';

interface WarmupResponse {
  status: 'ok' | 'partial' | 'error';
  db: 'ok' | 'error';
  grader: 'ok' | 'error';
}

export default function SystemWarmupButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WarmupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleWarmup = async () => {
    setLoading(true);
    setError(null);
    setShowModal(true);

    try {
      const res = await fetch('/api/system/warmup', {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || 'Không thể khởi động hệ thống. Vui lòng thử lại.');
        setLoading(false);
        return;
      }

      const data: WarmupResponse = await res.json();
      setResult(data);
    } catch {
      setError('Lỗi kết nối khi khởi động hệ thống.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleWarmup}
        disabled={loading}
        data-testid="warmup-btn"
      >
        {loading ? 'Đang khởi động...' : 'Khởi động hệ thống'}
      </button>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px' }}
          >
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>
              Trạng thái khởi động hệ thống
            </h3>

            {loading && (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <p>Đang kiểm tra kết nối Database và Grader...</p>
              </div>
            )}

            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}

            {result && !loading && (
              <div>
                <div
                  className={`alert ${
                    result.status === 'ok'
                      ? 'alert-success'
                      : result.status === 'partial'
                        ? 'alert-warning'
                        : 'alert-danger'
                  }`}
                  data-testid="warmup-status-alert"
                >
                  {result.status === 'ok'
                    ? 'Toàn bộ hệ thống đã sẵn sàng cho buổi học!'
                    : result.status === 'partial'
                      ? 'Một số thành phần chưa sẵn sàng.'
                      : 'Hệ thống gặp sự cố khi khởi động.'}
                </div>

                <table className="table" style={{ marginTop: '0.5rem' }}>
                  <tbody>
                    <tr>
                      <td>
                        <strong>Cơ sở dữ liệu (Database):</strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${result.db === 'ok' ? 'badge-ac' : 'badge-wa'}`}
                          data-testid="db-status"
                        >
                          {result.db === 'ok' ? 'Sẵn sàng (OK)' : 'Lỗi (Error)'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Máy chủ chấm bài (Grader):</strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${result.grader === 'ok' ? 'badge-ac' : 'badge-wa'}`}
                          data-testid="grader-status"
                        >
                          {result.grader === 'ok' ? 'Sẵn sàng (OK)' : 'Lỗi (Error)'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
