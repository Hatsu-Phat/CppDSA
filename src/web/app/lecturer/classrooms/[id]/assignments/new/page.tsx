'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AssignmentForm from '@/components/AssignmentForm';

export default function CreateAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const classroomId = params?.id as string;

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
