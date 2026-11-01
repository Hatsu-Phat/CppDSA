'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import ThemeToggle from '@/components/ThemeToggle';
import MockCodeWindow from '@/components/MockCodeWindow';

export default function HomePage() {
  const [roleUrl, setRoleUrl] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data?.user?.role === 'LECTURER') {
            setRoleUrl('/lecturer');
          } else if (data?.user?.role === 'STUDENT') {
            setRoleUrl('/student');
          }
        }
      } catch {
        // Not logged in
      }
    }
    checkAuth();
  }, []);

  const loginTarget = roleUrl || '/login';
  const loginLabel = roleUrl ? 'Vào bảng điều khiển' : 'Đăng nhập';

  return (
    <div
      className="bg-grid"
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div className="brand-icon-box">&lt;/&gt;</div>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {BRAND.name}
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ThemeToggle />
          <Link
            href={loginTarget}
            className="btn btn-primary"
            data-testid="header-login-btn"
            style={{ fontWeight: 600 }}
          >
            {loginLabel}
          </Link>
        </div>
      </header>

      {/* Hero Body */}
      <main
        className="container"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2.5rem 1.5rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '2.5rem',
            alignItems: 'center',
            width: '100%',
            maxWidth: '1100px',
          }}
        >
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--primary)',
                  backgroundColor: 'var(--primary-light)',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '9999px',
                }}
              >
                {BRAND.subject}
              </span>
            </div>

            <h1
              style={{
                fontSize: '2.5rem',
                lineHeight: 1.2,
                fontWeight: 800,
                color: 'var(--text-main)',
                whiteSpace: 'pre-line',
              }}
            >
              {BRAND.heroHeadline}
            </h1>

            <p
              style={{
                fontSize: '1.05rem',
                lineHeight: 1.6,
                color: 'var(--text-muted)',
              }}
            >
              {BRAND.heroIntro}
            </p>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}
            >
              <Link
                href={loginTarget}
                className="btn btn-primary"
                data-testid="home-login-btn"
                style={{
                  padding: '0.75rem 1.75rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                {loginLabel}
              </Link>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-subtle)', marginTop: '0.5rem' }}>
              <a
                href={BRAND.parentUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--text-subtle)', textDecoration: 'none' }}
              >
                {BRAND.parentName}
              </a>
            </div>
          </div>

          {/* Right Column: Mock Code Window */}
          <div>
            <MockCodeWindow />
          </div>
        </div>
      </main>
    </div>
  );
}
