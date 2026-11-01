'use client';

import React, { useState } from 'react';
import { isValidCppIdentifier } from '@cppdsa/shared';

export interface FreeModeEditorProps {
  entryPointSpec?: {
    harness?: string;
    entry?: {
      type: 'function' | 'method';
      name: string;
      className?: string;
    };
  };
  initialSource?: string;
  initialEntry?: {
    type: 'function' | 'method';
    name: string;
    className?: string;
  };
  onSubmit: (payload: {
    studentSource: string;
    entry: {
      type: 'function' | 'method';
      name: string;
      className?: string;
    };
  }) => Promise<void> | void;
  submitting?: boolean;
}

export default function FreeModeEditor({
  entryPointSpec,
  initialSource = '',
  initialEntry,
  onSubmit,
  submitting = false,
}: FreeModeEditorProps) {
  const [studentSource, setStudentSource] = useState(initialSource);
  const [entryType, setEntryType] = useState<'function' | 'method'>(
    initialEntry?.type ?? entryPointSpec?.entry?.type ?? 'function'
  );
  const [entryName, setEntryName] = useState(
    initialEntry?.name ?? entryPointSpec?.entry?.name ?? ''
  );
  const [className, setClassName] = useState(
    initialEntry?.className ?? entryPointSpec?.entry?.className ?? ''
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

    const trimmedName = entryName.trim();
    if (!trimmedName) {
      setError('Thiếu tên điểm vào hoặc tên không hợp lệ');
      return;
    }

    if (!isValidCppIdentifier(trimmedName)) {
      setError(`Tên '${trimmedName}' không phải là định danh C++ hợp lệ hoặc trùng từ khóa`);
      return;
    }

    if (entryType === 'method') {
      const trimmedClass = className.trim();
      if (!trimmedClass) {
        setError('Phương thức (method) yêu cầu khai báo tên lớp');
        return;
      }
      if (!isValidCppIdentifier(trimmedClass)) {
        setError(`Tên lớp '${trimmedClass}' không phải là định danh C++ hợp lệ hoặc trùng từ khóa`);
        return;
      }
    }

    const entryPayload = {
      type: entryType,
      name: trimmedName,
      ...(entryType === 'method' ? { className: className.trim() } : {}),
    };

    onSubmit({
      studentSource,
      entry: entryPayload,
    });
  };

  return (
    <form onSubmit={handleSubmit} data-testid="free-mode-editor-form">
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.5rem', color: 'var(--neutral-900)' }}>
          Trình soạn thảo chế độ Tự do (Free Mode)
        </h4>
        <p style={{ fontSize: '0.875rem', color: 'var(--neutral-600)' }}>
          Bạn có thể tự do viết mã nguồn hoặc tải lên tệp .cpp, sau đó khai báo tên hàm hoặc phương
          thức điểm vào.
        </p>
      </div>

      {entryPointSpec && (
        <div
          className="card"
          style={{
            backgroundColor: 'var(--neutral-50)',
            border: '1px solid var(--neutral-300)',
            padding: '1rem',
            marginBottom: '1rem',
          }}
          data-testid="free-spec-section"
        >
          <h5 style={{ marginBottom: '0.5rem', color: 'var(--primary)' }}>
            Giao diện chấm yêu cầu:
          </h5>
          {entryPointSpec.entry && (
            <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Điểm vào: <strong>{entryPointSpec.entry.type}</strong>{' '}
              <code>{entryPointSpec.entry.name}</code>
              {entryPointSpec.entry.className && (
                <span>
                  {' '}
                  trong lớp <code>{entryPointSpec.entry.className}</code>
                </span>
              )}
            </p>
          )}
          {entryPointSpec.harness && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--primary)' }}>
                Xem mã kiểm thử (Harness code)
              </summary>
              <pre
                className="code-box"
                style={{
                  fontSize: '0.8rem',
                  marginTop: '0.5rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                <code>{entryPointSpec.harness}</code>
              </pre>
            </details>
          )}
        </div>
      )}

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
            Mã nguồn C++ (.cpp)
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
          placeholder="// Dán hoặc nhập mã nguồn C++ của bạn tại đây"
          style={{
            minHeight: '220px',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: '0.875rem',
          }}
          disabled={submitting}
        />
      </div>

      <div
        className="card"
        style={{
          border: '1px solid var(--neutral-300)',
          padding: '1rem',
          marginBottom: '1rem',
        }}
        data-testid="entry-point-declaration-section"
      >
        <h5 style={{ marginBottom: '0.75rem', color: 'var(--neutral-900)' }}>
          Khai báo điểm vào (Entry Point Declaration)
        </h5>

        <div className="form-row">
          <div className="form-col" style={{ maxWidth: '200px' }}>
            <label className="form-label" htmlFor="entry-type">
              Loại điểm vào
            </label>
            <select
              id="entry-type"
              className="form-control"
              data-testid="entry-type-select"
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as 'function' | 'method')}
              disabled={submitting}
            >
              <option value="function">Hàm (Function)</option>
              <option value="method">Phương thức (Method)</option>
            </select>
          </div>

          <div className="form-col">
            <label className="form-label" htmlFor="entry-name">
              Tên hàm / phương thức
            </label>
            <input
              id="entry-name"
              type="text"
              className="form-control"
              data-testid="entry-name-input"
              value={entryName}
              onChange={(e) => setEntryName(e.target.value)}
              placeholder="Ví dụ: timChiSoTong"
              disabled={submitting}
            />
          </div>

          {entryType === 'method' && (
            <div className="form-col">
              <label className="form-label" htmlFor="class-name">
                Tên lớp (Class Name)
              </label>
              <input
                id="class-name"
                type="text"
                className="form-control"
                data-testid="entry-class-name-input"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Ví dụ: Solution"
                disabled={submitting}
              />
            </div>
          )}
        </div>
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
