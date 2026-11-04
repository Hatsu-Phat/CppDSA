'use client';

import React, { useState, useEffect } from 'react';
import { extractTemplateRegions } from '@cppdsa/shared';

export interface TemplateSegment {
  type: 'fixed' | 'region';
  name?: string;
  code: string;
}

export function parseTemplateSegments(template: string): TemplateSegment[] {
  if (!template) return [];

  const segments: TemplateSegment[] = [];
  const markerRegex = /\/\/\s*STUDENT_BEGIN\s+([A-Za-z0-9_]+)[\r\n]+([\s\S]*?)\/\/\s*STUDENT_END/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'fixed',
        code: template.substring(lastIndex, match.index),
      });
    }

    segments.push({
      type: 'region',
      name: match[1],
      code: match[2],
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    segments.push({
      type: 'fixed',
      code: template.substring(lastIndex),
    });
  }

  return segments;
}

export interface TemplateEditorProps {
  templateCode: string;
  initialRegions?: Record<string, string>;
  onSubmit: (payload: { regions: Record<string, string> }) => Promise<void> | void;
  submitting?: boolean;
}

export default function TemplateEditor({
  templateCode,
  initialRegions,
  onSubmit,
  submitting = false,
}: TemplateEditorProps) {
  const [segments, setSegments] = useState<TemplateSegment[]>([]);
  const [regions, setRegions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parsed = parseTemplateSegments(templateCode);
    setSegments(parsed);

    const initial: Record<string, string> = {};
    for (const seg of parsed) {
      if (seg.type === 'region' && seg.name) {
        initial[seg.name] = initialRegions?.[seg.name] ?? seg.code;
      }
    }
    setRegions(initial);
  }, [templateCode, initialRegions]);

  const handleRegionChange = (name: string, value: string) => {
    setRegions((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, name: string) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = textarea.value;
      const updated = current.substring(0, start) + '    ' + current.substring(end);
      handleRegionChange(name, updated);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const declaredRegions = extractTemplateRegions(templateCode);
    let totalBytes = 0;

    for (const rName of declaredRegions) {
      const code = regions[rName] ?? '';
      const encoder = new TextEncoder();
      totalBytes += encoder.encode(code).length;
    }

    if (totalBytes > 65536) {
      setError('Tổng dung lượng mã trong các vùng vượt quá giới hạn 64 KB');
      return;
    }

    onSubmit({ regions });
  };

  return (
    <form onSubmit={handleSubmit} data-testid="template-editor-form">
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-main)' }}>Mã nguồn bài làm</h4>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Các phần code cố định được khóa chỉ đọc. Bạn chỉ có thể chỉnh sửa bên trong các vùng được
          mở.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger" data-testid="template-editor-error" role="alert">
          {error}
        </div>
      )}

      <div
        className="editor-workspace"
        style={{
          border: '1px solid var(--neutral-300)',
          borderRadius: 'var(--border-radius)',
          padding: '1rem',
          backgroundColor: '#fafafa',
          marginBottom: '1rem',
        }}
      >
        {segments.map((segment, idx) => {
          if (segment.type === 'fixed') {
            return (
              <div key={idx} style={{ margin: '0.25rem 0' }}>
                <pre
                  className="code-box"
                  data-testid="fixed-code-segment"
                  style={{
                    margin: 0,
                    padding: '0.75rem',
                    backgroundColor: '#2d3748',
                    color: '#e2e8f0',
                    userSelect: 'none',
                    opacity: 0.95,
                  }}
                >
                  <code>{segment.code}</code>
                </pre>
              </div>
            );
          }

          const regionName = segment.name!;
          return (
            <div
              key={idx}
              style={{
                margin: '0.5rem 0',
                padding: '0.75rem',
                backgroundColor: '#ffffff',
                border: '2px solid var(--primary)',
                borderRadius: 'var(--border-radius)',
              }}
            >
              <label
                className="form-label"
                htmlFor={`region-${regionName}`}
                style={{
                  fontWeight: 600,
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>Vùng sinh viên:</span>
                <code>{regionName}</code>
              </label>
              <textarea
                id={`region-${regionName}`}
                className="form-control"
                data-testid={`region-input-${regionName}`}
                value={regions[regionName] ?? ''}
                onChange={(e) => handleRegionChange(regionName, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, regionName)}
                style={{
                  minHeight: '160px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                  fontSize: '0.875rem',
                  lineHeight: '1.4',
                }}
                placeholder={`// Cài đặt nội dung hàm/lớp cho vùng ${regionName}`}
                disabled={submitting}
              />
            </div>
          );
        })}
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
