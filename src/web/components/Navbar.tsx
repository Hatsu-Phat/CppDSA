'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import ThemeToggle from '@/components/ThemeToggle';

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
        <Link
          href={roleUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div className="brand-icon-box">&lt;/&gt;</div>
          <span>{BRAND.name}</span>
          {roleLabel && (
            <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>
              | {roleLabel}
            </span>
          )}
        </Link>
      </div>

      <nav className="navbar-nav">
        <Link href={roleUrl} className="btn btn-secondary btn-sm" data-testid="nav-classrooms-link">
          Danh sách lớp
        </Link>

        <ThemeToggle />

        {user && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '0.25rem' }}
          >
            <Link
              href="/account"
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-main)',
                fontWeight: 500,
                textDecoration: 'none',
              }}
              data-testid="user-email-display"
              title="Quản lý tài khoản"
            >
              {user.email}
            </Link>
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
