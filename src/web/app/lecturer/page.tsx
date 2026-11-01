'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Classroom {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export default function LecturerClassroomsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchClassrooms = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/classrooms');
      if (!res.ok) {
        throw new Error('Không thể tải danh sách lớp học');
      }
      const data = await res.json();
      setClassrooms(data.classrooms || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải danh sách lớp học');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClassrooms();
  }, [fetchClassrooms]);

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!name.trim()) {
      setCreateError('Tên lớp học là bắt buộc');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setCreateError(data?.message || 'Không thể tạo lớp học. Vui lòng kiểm tra lại.');
        setSubmitting(false);
        return;
      }

      setName('');
      setDescription('');
      setShowCreateModal(false);
      await fetchClassrooms();
    } catch {
      setCreateError('Lỗi kết nối khi tạo lớp học.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClassroom = async (id: string, className: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa lớp "${className}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/classrooms/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.message || 'Không thể xóa lớp học');
        return;
      }
      await fetchClassrooms();
    } catch {
      alert('Lỗi kết nối khi xóa lớp học');
    }
  };

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
        <div>
          <h2>Quản lý Lớp học</h2>
          <p style={{ color: 'var(--neutral-600)', fontSize: '0.9rem' }}>
            Danh sách các lớp học do bạn quản lý và giảng dạy
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
          data-testid="create-classroom-btn"
        >
          + Tạo lớp học mới
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Đang tải danh sách lớp học...</p>
        </div>
      ) : classrooms.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--neutral-600)', marginBottom: '1rem' }}>
            Bạn chưa tạo lớp học nào. Bắt đầu bằng cách tạo lớp học đầu tiên!
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            Tạo lớp học ngay
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {classrooms.map((c) => (
            <div
              key={c.id}
              className="card"
              data-testid={`classroom-card-${c.id}`}
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              <div>
                <h3
                  style={{ fontSize: '1.15rem', color: 'var(--primary)', marginBottom: '0.5rem' }}
                >
                  <Link href={`/lecturer/classrooms/${c.id}`} style={{ textDecoration: 'none' }}>
                    {c.name}
                  </Link>
                </h3>
                <p
                  style={{
                    color: 'var(--neutral-600)',
                    fontSize: '0.875rem',
                    marginBottom: '1rem',
                    minHeight: '2.5rem',
                  }}
                >
                  {c.description || 'Chưa có mô tả cho lớp học này.'}
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--neutral-200)',
                }}
              >
                <Link
                  href={`/lecturer/classrooms/${c.id}`}
                  className="btn btn-secondary btn-sm"
                  data-testid={`enter-classroom-${c.id}`}
                >
                  Vào quản lý lớp →
                </Link>

                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteClassroom(c.id, c.name)}
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px' }}
          >
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Tạo lớp học mới</h3>

            {createError && (
              <div className="alert alert-danger" role="alert">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateClassroom}>
              <div className="form-group">
                <label className="form-label" htmlFor="classroom-name">
                  Tên lớp học *
                </label>
                <input
                  id="classroom-name"
                  type="text"
                  className="form-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Cấu trúc Dữ liệu & Giải thuật - Lớp 01"
                  required
                  data-testid="classroom-name-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="classroom-desc">
                  Mô tả lớp học (tùy chọn)
                </label>
                <textarea
                  id="classroom-desc"
                  className="form-control"
                  style={{ minHeight: '80px' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Học kỳ 1 năm học 2026-2027..."
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  justifyContent: 'flex-end',
                  marginTop: '1.5rem',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  data-testid="submit-classroom-btn"
                >
                  {submitting ? 'Đang tạo...' : 'Tạo lớp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
