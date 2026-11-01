'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Classroom {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export default function StudentClassroomsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Lớp học của tôi</h2>
        <p style={{ color: 'var(--neutral-600)', fontSize: '0.95rem' }}>
          Danh sách các lớp học thực hành CppDSA bạn đã được ghi danh tham gia.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Đang tải danh sách lớp học...</p>
        </div>
      ) : classrooms.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: '3rem', color: 'var(--neutral-600)' }}
          data-testid="no-classrooms-msg"
        >
          <p>Bạn chưa được ghi danh vào lớp học nào.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
          data-testid="classrooms-list"
        >
          {classrooms.map((c) => (
            <div
              key={c.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                margin: 0,
              }}
              data-testid={`classroom-card-${c.id}`}
            >
              <div>
                <h3
                  style={{
                    fontSize: '1.2rem',
                    color: 'var(--neutral-900)',
                    marginBottom: '0.5rem',
                  }}
                >
                  {c.name}
                </h3>
                {c.description && (
                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--neutral-600)',
                      marginBottom: '1rem',
                      lineHeight: '1.4',
                    }}
                  >
                    {c.description}
                  </p>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--neutral-200)',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--neutral-600)' }}>
                  Ngày tạo: {new Date(c.created_at).toLocaleDateString('vi-VN')}
                </span>
                <Link
                  href={`/student/classrooms/${c.id}`}
                  className="btn btn-primary btn-sm"
                  data-testid={`enter-classroom-${c.id}`}
                >
                  Vào lớp học →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
