'use client';

import React, { useState } from 'react';

const DEFAULT_FREE_SOURCE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    
    return 0;
}
`;

export interface FreeModeEditorProps {
  initialSource?: string;
  onSubmit: (payload: { studentSource: string }) => Promise<void> | void;
  submitting?: boolean;
}

export default function FreeModeEditor({
  initialSource,
  onSubmit,
  submitting = false,
}: FreeModeEditorProps) {
  const [studentSource, setStudentSource] = useState(
    initialSource !== undefined ? initialSource : DEFAULT_FREE_SOURCE
  );
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 65536) {
      setError('Tệp tin vượt quá dung lượng tối đa 64 KB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setStudentSource(content || '');
    };
    reader.onerror = () => {
      setError('Lỗi khi đọc tệp tin');
    };
    reader.readAsText(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = textarea.value;
      const updated = current.substring(0, start) + '    ' + current.substring(end);
      setStudentSource(updated);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!studentSource.trim()) {
      setError('Mã nguồn sinh viên không được để trống');
      return;
    }

    const encoder = new TextEncoder();
    if (encoder.encode(studentSource).length > 65536) {
      setError('Mã nguồn sinh viên vượt quá dung lượng tối đa 64 KB');
      return;
    }

    onSubmit({ studentSource });
  };

  return (
    <form onSubmit={handleSubmit} data-testid="free-mode-editor-form">
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.25rem', color: 'var(--text-main)' }}>
          Mã nguồn bài làm (C++)
        </h4>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Chương trình hoàn chỉnh có hàm <code>main()</code>. Nhập xuất qua <code>cin</code> và{' '}
          <code>cout</code>.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger" data-testid="free-mode-editor-error" role="alert">
          {error}
        </div>
      )}

      <div className="form-group">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <label className="form-label" htmlFor="free-source" style={{ margin: 0 }}>
            Trình soạn thảo
          </label>
          <div>
            <label
              htmlFor="upload-cpp"
              className="btn btn-secondary btn-sm"
              style={{ cursor: 'pointer' }}
            >
              Tải tệp .cpp
            </label>
            <input
              id="upload-cpp"
              type="file"
              accept=".cpp,.cc,.cxx"
              data-testid="upload-cpp-file"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              disabled={submitting}
            />
          </div>
        </div>

        <textarea
          id="free-source"
          className="form-control"
          data-testid="free-source-input"
          value={studentSource}
          onChange={(e) => setStudentSource(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="// Dán hoặc nhập mã nguồn C++ của bạn tại đây"
          style={{
            minHeight: '280px',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            fontSize: '0.875rem',
            lineHeight: 1.5,
          }}
          disabled={submitting}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="submit-solution-btn"
          disabled={submitting}
          style={{ minWidth: '140px' }}
        >
          {submitting ? 'Đang gửi...' : 'Nộp bài'}
        </button>
      </div>
    </form>
  );
}
