'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Assignment {
  id: string;
  classroom_id: string;
  title: string;
  description: string | null;
  mode: 'TEMPLATE' | 'FREE';
  time_limit_ms: number;
  memory_limit_mb: number;
  deadline: string;
  bestScore?: number | string | null;
  submissionCount?: number | string;
}

interface Classroom {
  id: string;
  name: string;
  description: string | null;
}

export default function StudentClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!classroomId) return;
    try {
      setLoading(true);
      setError(null);

      const [classRes, assignRes] = await Promise.all([
        fetch(`/api/classrooms/${classroomId}`),
        fetch(`/api/classrooms/${classroomId}/assignments`),
      ]);

      if (!classRes.ok) {
        throw new Error('Không thể tải thông tin lớp học');
      }
      const classData = await classRes.json();
      setClassroom(classData.classroom);

      if (!assignRes.ok) {
        throw new Error('Không thể tải danh sách bài tập');
      }
      const assignData = await assignRes.json();
      setAssignments(assignData.assignments || []);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải dữ liệu lớp học');
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Đang tải dữ liệu lớp học...</p>
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="card">
        <div className="alert alert-danger" role="alert">
          {error || 'Không tìm thấy lớp học'}
        </div>
        <Link href="/student" className="btn btn-secondary btn-sm">
          ← Về danh sách lớp
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          href="/student"
          className="btn btn-secondary btn-sm"
          style={{ marginBottom: '0.75rem' }}
        >
          ← Danh sách lớp
        </Link>
        <h2
          style={{ color: 'var(--primary)', marginBottom: '0.25rem' }}
          data-testid="classroom-title"
        >
          {classroom.name}
        </h2>
        {classroom.description && (
          <p style={{ color: 'var(--neutral-600)', fontSize: '0.95rem' }}>
            {classroom.description}
          </p>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', color: 'var(--neutral-900)' }}>
          Danh sách bài tập thực hành ({assignments.length})
        </h3>
      </div>

      {assignments.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: '3rem', color: 'var(--neutral-600)' }}
          data-testid="no-assignments-msg"
        >
          <p>Chưa có bài tập nào được giao trong lớp học này.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
          data-testid="assignments-list"
        >
          {assignments.map((assignment) => {
            const deadlineDate = new Date(assignment.deadline);
            const isPastDeadline = Date.now() > deadlineDate.getTime();
            const formattedBestScore =
              assignment.bestScore !== null && assignment.bestScore !== undefined
                ? Number(assignment.bestScore).toFixed(2)
                : 'Chưa có';

            return (
              <div
                key={assignment.id}
                className="card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  margin: 0,
                }}
                data-testid={`assignment-card-${assignment.id}`}
              >
                <div style={{ flex: '1 1 300px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <h4
                      style={{ margin: 0, color: 'var(--neutral-900)' }}
                      data-testid={`assignment-title-${assignment.id}`}
                    >
                      {assignment.title}
                    </h4>
                    {isPastDeadline && (
                      <span
                        className="badge badge-warning"
                        data-testid={`late-badge-${assignment.id}`}
                      >
                        Hạn nộp đã qua
                      </span>
                    )}
                  </div>

                  {assignment.description && (
                    <p
                      style={{
                        fontSize: '0.875rem',
                        color: 'var(--neutral-600)',
                        marginBottom: '0.75rem',
                      }}
                    >
                      {assignment.description}
                    </p>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      gap: '1.25rem',
                      fontSize: '0.8rem',
                      color: 'var(--neutral-600)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>TL: {assignment.time_limit_ms} ms</span>
                    <span>ML: {assignment.memory_limit_mb} MB</span>
                    <span>Hạn nộp: {deadlineDate.toLocaleString('vi-VN')}</span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '0.5rem',
                  }}
                >
                  <div
                    style={{ fontSize: '0.875rem', fontWeight: 600 }}
                    data-testid={`assignment-best-score-${assignment.id}`}
                  >
                    Điểm chính thức:{' '}
                    <span style={{ color: 'var(--primary)' }}>{formattedBestScore}</span>
                  </div>
                  <Link
                    href={`/student/assignments/${assignment.id}`}
                    className="btn btn-primary"
                    data-testid={`assignment-link-${assignment.id}`}
                  >
                    Làm bài →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
