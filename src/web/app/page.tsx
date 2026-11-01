import React from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#1976d2' }}>CppDSA</h1>
      <p style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '2rem' }}>
        Hệ thống chấm bài thực hành C++ môn Cấu trúc dữ liệu và Giải thuật
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <Link href="/login" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
          Đăng nhập hệ thống
        </Link>
        <Link href="/lecturer" className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem' }}>
          Giao diện Giảng viên
        </Link>
      </div>
    </main>
  );
}
