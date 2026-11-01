'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  mustChangePassword?: boolean;
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!mounted) return;

        if (res.status === 401) {
          router.push('/login');
          return;
        }

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.user) {
          router.push('/login');
          return;
        }

        if (data.user.mustChangePassword) {
          router.push('/change-password');
          return;
        }

        if (data.user.role !== 'STUDENT') {
          setForbidden(true);
          setLoading(false);
          return;
        }

        setUser(data.user);
        setLoading(false);
      } catch {
        if (mounted) {
          router.push('/login');
        }
      }
    }

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '5rem' }}>
        <p>Đang kiểm tra quyền truy cập sinh viên...</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="container" style={{ maxWidth: '480px', marginTop: '5rem' }}>
        <div className="alert alert-danger" role="alert" data-testid="student-forbidden-alert">
          <h3>403 - Quyền truy cập bị từ chối</h3>
          <p style={{ marginTop: '0.5rem' }}>
            Bạn không có quyền truy cập vào khu vực dành riêng cho Sinh viên.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '1rem' }}
            onClick={() => router.push('/login')}
          >
            Quay lại Đăng nhập
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar user={user} />
      <main className="container">{children}</main>
    </div>
  );
}
