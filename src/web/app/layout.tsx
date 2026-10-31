import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'CppDSA',
  description: 'C++ Data Structures and Algorithms Online Judge',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
