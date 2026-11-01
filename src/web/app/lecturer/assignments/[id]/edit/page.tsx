'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AssignmentForm, { AssignmentFormData } from '@/components/AssignmentForm';

export default function EditAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params?.id as string;

  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAssignment() {
      try {
        const res = await fetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) throw new Error('Không tìm thấy bài tập');
        const data = await res.json();
        setAssignment(data.assignment);
      } catch (err: any) {
        setError(err.message || 'Lỗi khi tải thông tin bài tập');
      } finally {
        setLoading(false);
      }
    }

    if (assignmentId) {
      fetchAssignment();
    }
  }, [assignmentId]);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Đang tải thông tin bài tập...</p>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="alert alert-danger" role="alert">
        {error || 'Không tìm thấy bài tập'}
      </div>
    );
  }

  const initialData: Partial<AssignmentFormData> = {
    title: assignment.title,
    description: assignment.description || '',
    mode: assignment.mode,
    timeLimitMs: assignment.time_limit_ms,
    memoryLimitMb: assignment.memory_limit_mb,
    deadline: assignment.deadline,
    templateCode: assignment.template_code || '',
    entryPointSpec: assignment.entry_point_spec,
  };

  const classroomId = assignment.classroom_id;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          href={`/lecturer/classrooms/${classroomId}`}
          style={{ fontSize: '0.875rem', color: 'var(--neutral-600)' }}
        >
          ← Quay lại chi tiết lớp
        </Link>
      </div>

      <AssignmentForm
        initialData={initialData}
        assignmentId={assignmentId}
        classroomId={classroomId}
        onSuccess={() => {
          router.push(`/lecturer/classrooms/${classroomId}`);
        }}
        onCancel={() => {
          router.push(`/lecturer/classrooms/${classroomId}`);
        }}
      />
    </div>
  );
}
