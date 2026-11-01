'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import ThemeToggle from '@/components/ThemeToggle';

interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu mới không trùng khớp');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          data?.message || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu hiện tại.'
        );
        setSubmitting(false);
        return;
      }

      setSuccess('Đổi mật khẩu thành công!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('Lỗi kết nối tới máy chủ khi đổi mật khẩu.');
    } finally {
      setSubmitting(false);
    }
  };

  const roleLabel =
    user?.role === 'LECTURER'
      ? 'Giảng viên'
      : user?.role === 'STUDENT'
        ? 'Sinh viên'
        : user?.role || '';
  const backUrl = user?.role === 'LECTURER' ? '/lecturer' : '/student';

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '5rem' }}>
        <p>Đang tải thông tin tài khoản...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Navbar */}
      <header className="navbar">
        <div className="navbar-brand">
          <Link
            href={backUrl}
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

        <div className="navbar-nav">
          <ThemeToggle />
          <Link href={backUrl} className="btn btn-secondary btn-sm">
            ← Quay lại
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="container" style={{ maxWidth: '640px', marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>Thông tin tài khoản</h2>

        {/* User Information Card */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
            Hồ sơ người dùng
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '0.75rem',
              fontSize: '0.9rem',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Họ và tên:</span>
            <strong data-testid="account-fullname">{user?.fullName || '—'}</strong>

            <span style={{ color: 'var(--text-muted)' }}>Email:</span>
            <span data-testid="account-email">{user?.email || '—'}</span>

            <span style={{ color: 'var(--text-muted)' }}>Vai trò:</span>
            <span>
              <span className="badge badge-primary" data-testid="account-role">
                {roleLabel}
              </span>
            </span>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="card">
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
            Đổi mật khẩu
          </h3>

          {error && (
            <div className="alert alert-danger" role="alert" data-testid="account-pwd-error">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success" role="alert" data-testid="account-pwd-success">
              {success}
            </div>
          )}

          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label" htmlFor="oldPassword">
                Mật khẩu hiện tại *
              </label>
              <input
                id="oldPassword"
                type="password"
                className="form-control"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                data-testid="old-password-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="newPassword">
                Mật khẩu mới (tối thiểu 6 ký tự) *
              </label>
              <input
                id="newPassword"
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                data-testid="new-password-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">
                Xác nhận mật khẩu mới *
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                data-testid="confirm-password-input"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="change-pwd-btn"
              style={{ marginTop: '0.5rem' }}
            >
              {submitting ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
