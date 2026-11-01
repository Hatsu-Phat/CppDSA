'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SystemWarmupButton from './SystemWarmupButton';

interface NavbarProps {
  user?: {
    email: string;
    fullName?: string;
    role: string;
  } | null;
}

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  };

  const isLecturer = user?.role === 'LECTURER';
  const roleUrl = isLecturer ? '/lecturer' : '/student';
  const roleLabel = isLecturer ? 'Giảng viên' : user?.role === 'STUDENT' ? 'Sinh viên' : '';

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <Link href={roleUrl} style={{ textDecoration: 'none', color: 'inherit' }}>
          CppDSA{' '}
          {roleLabel && (
            <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--neutral-600)' }}>
              | {roleLabel}
            </span>
          )}
        </Link>
      </div>

      <nav className="navbar-nav">
        <Link href={roleUrl} className="btn btn-secondary btn-sm" data-testid="nav-classrooms-link">
          Danh sách lớp
        </Link>

        {isLecturer && <SystemWarmupButton />}

        {user && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '0.5rem' }}
          >
            <span
              style={{ fontSize: '0.85rem', color: 'var(--neutral-700)' }}
              data-testid="user-email-display"
            >
              {user.email}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              Đăng xuất
            </button>
          </div>
        )}
      </nav>
    </header>
  );
}
