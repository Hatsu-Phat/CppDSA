'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

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
      className="container"
      style={{
        maxWidth: '420px',
        marginTop: '5rem',
      }}
    >
      <div className="card">
        <h2 style={{ marginBottom: '1.5rem', textAlign: 'center', color: 'var(--primary)' }}>
          Đăng nhập CppDSA
        </h2>

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
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={loading}
          >
            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
