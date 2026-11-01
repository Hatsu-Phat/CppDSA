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

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <Link href="/lecturer" style={{ textDecoration: 'none', color: 'inherit' }}>
          CppDSA{' '}
          <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--neutral-600)' }}>
            | Giảng viên
          </span>
        </Link>
      </div>

      <nav className="navbar-nav">
        <Link href="/lecturer" className="btn btn-secondary btn-sm">
          Danh sách lớp
        </Link>

        <SystemWarmupButton />

        {user && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '0.5rem' }}
          >
            <span style={{ fontSize: '0.85rem', color: 'var(--neutral-700)' }}>{user.email}</span>
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
