'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import ThemeToggle from '@/components/ThemeToggle';

/**
 * Placeholder cho xác thực mở rộng (SSO) qua FTISU LMS trong tương lai.
 * Hiện tại trả về mảng rỗng và không hiển thị nút giả trên giao diện.
 */
export function loginProviders(): Array<{ id: string; name: string }> {
  return [];
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          setError('Email hoặc mật khẩu không chính xác');
        } else if (res.status === 429) {
          setError('Quá nhiều lần đăng nhập không thành công. Vui lòng đợi.');
        } else {
          setError(data?.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
        }
        setLoading(false);
        return;
      }

      if (data?.user?.mustChangePassword) {
        router.push('/change-password');
        return;
      }

      if (data?.user?.role === 'LECTURER') {
        router.push('/lecturer');
      } else if (data?.user?.role === 'STUDENT') {
        router.push('/student');
      } else {
        router.push('/');
      }
    } catch {
      setError('Lỗi kết nối tới máy chủ. Vui lòng thử lại.');
      setLoading(false);
    }
  };

  return (
    <div
      className="bg-grid"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Bar with Brand & Theme Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div className="brand-icon-box">&lt;/&gt;</div>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>
            {BRAND.name}
          </span>
        </Link>
        <ThemeToggle />
      </div>

      <div
        className="container"
        style={{
          maxWidth: '420px',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className="card" style={{ width: '100%', padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h2
              style={{
                marginBottom: '0.25rem',
                color: 'var(--primary)',
                fontSize: '1.5rem',
              }}
            >
              Đăng nhập {BRAND.name}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{BRAND.tagline}</p>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Địa chỉ Email
              </label>
              <input
                id="email"
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.65rem' }}
              disabled={loading}
            >
              {loading ? 'Đang xử lý...' : 'Đăng nhập'}
            </button>
          </form>

          <div
            style={{
              textAlign: 'center',
              marginTop: '1.5rem',
              fontSize: '0.8rem',
              color: 'var(--text-subtle)',
            }}
          >
            <a
              href={BRAND.parentUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--text-subtle)' }}
            >
              {BRAND.parentName}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
