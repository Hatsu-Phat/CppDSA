'use client';

import React, { useState } from 'react';

export interface AssignmentFormData {
  title: string;
  description: string;
  mode: 'TEMPLATE' | 'FREE';
  timeLimitMs: number;
  memoryLimitMb: number;
  deadline: string;
  templateCode?: string;
  entryPointSpec?: any;
}

export interface AssignmentFormProps {
  initialData?: Partial<AssignmentFormData>;
  classroomId?: string;
  assignmentId?: string;
  onSubmitCustom?: (data: AssignmentFormData) => Promise<any>;
  onSuccess?: (createdAssignment: any) => void;
  onCancel?: () => void;
}

export function validateClientTemplate(code: string): { valid: boolean; error?: string } {
  if (!code || !code.trim()) {
    return { valid: false, error: 'Mã template là bắt buộc đối với chế độ Template' };
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(code).length;
  if (bytes > 65536) {
    return { valid: false, error: 'Mã template vượt quá dung lượng tối đa (64 KB)' };
  }

  const markerRegex = /\/\/\s*STUDENT_(BEGIN|END)(?:\s+([A-Za-z0-9_]+))?/g;
  let match: RegExpExecArray | null;
  const openStack: string[] = [];
  let pairCount = 0;

  while ((match = markerRegex.exec(code)) !== null) {
    const type = match[1];
    const name = match[2];

    if (type === 'BEGIN') {
      if (!name) {
        return { valid: false, error: 'Thẻ // STUDENT_BEGIN yêu cầu tên định danh vùng' };
      }
      if (openStack.length > 0) {
        return {
          valid: false,
          error: `Không được lồng thẻ STUDENT_BEGIN bên trong vùng '${openStack[openStack.length - 1]}'`,
        };
      }
      openStack.push(name);
    } else if (type === 'END') {
      if (openStack.length === 0) {
        return { valid: false, error: 'Thừa thẻ // STUDENT_END không có STUDENT_BEGIN tương ứng' };
      }
      openStack.pop();
      pairCount++;
    }
  }

  if (openStack.length > 0) {
    return {
      valid: false,
      error: `Cặp marker template không hợp lệ: thiếu // STUDENT_END cho vùng '${openStack[openStack.length - 1]}'`,
    };
  }

  if (pairCount === 0) {
    return {
      valid: false,
      error:
        'Template phải chứa ít nhất một cặp marker // STUDENT_BEGIN <tên_vùng> và // STUDENT_END',
    };
  }

  return { valid: true };
}

export default function AssignmentForm({
  initialData,
  classroomId,
  assignmentId,
  onSubmitCustom,
  onSuccess,
  onCancel,
}: AssignmentFormProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [mode, setMode] = useState<'TEMPLATE' | 'FREE'>(initialData?.mode || 'TEMPLATE');
  const [timeLimitMs, setTimeLimitMs] = useState<number | string>(
    initialData?.timeLimitMs !== undefined ? initialData.timeLimitMs : 1000
  );
  const [memoryLimitMb, setMemoryLimitMb] = useState<number | string>(
    initialData?.memoryLimitMb !== undefined ? initialData.memoryLimitMb : 256
  );
  const [deadline, setDeadline] = useState(
    initialData?.deadline
      ? new Date(initialData.deadline).toISOString().slice(0, 16)
      : '2026-12-31T23:59'
  );
  const [templateCode, setTemplateCode] = useState(initialData?.templateCode || '');
  const [entryPointSpecText, setEntryPointSpecText] = useState(
    initialData?.entryPointSpec
      ? typeof initialData.entryPointSpec === 'string'
        ? initialData.entryPointSpec
        : JSON.stringify(initialData.entryPointSpec, null, 2)
      : ''
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Client-side validations
    if (!title.trim()) {
      setFormError('Tiêu đề bài tập không được để trống');
      return;
    }

    const tl = Number(timeLimitMs);
    if (isNaN(tl) || tl <= 0) {
      setFormError('Thời gian chạy (TL) phải là số dương (lớn hơn 0)');
      return;
    }

    const ml = Number(memoryLimitMb);
    if (isNaN(ml) || ml <= 0) {
      setFormError('Giới hạn bộ nhớ (ML) phải là số dương (lớn hơn 0)');
      return;
    }

    if (!deadline || isNaN(new Date(deadline).getTime())) {
      setFormError('Hạn nộp bài (deadline) không hợp lệ');
      return;
    }

    if (mode === 'TEMPLATE') {
      const markerResult = validateClientTemplate(templateCode);
      if (!markerResult.valid) {
        setFormError(markerResult.error || 'Cấu trúc marker template không hợp lệ');
        return;
      }
    }

    const payload: AssignmentFormData = {
      title: title.trim(),
      description: description.trim(),
      mode,
      timeLimitMs: tl,
      memoryLimitMb: ml,
      deadline: new Date(deadline).toISOString(),
      templateCode: mode === 'TEMPLATE' ? templateCode : undefined,
    };

    setSubmitting(true);

    try {
      if (onSubmitCustom) {
        const result = await onSubmitCustom(payload);
        if (onSuccess) onSuccess(result);
        return;
      }

      const url = assignmentId
        ? `/api/assignments/${assignmentId}`
        : `/api/classrooms/${classroomId}/assignments`;
      const method = assignmentId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setFormError(data?.message || data?.error || 'Có lỗi xảy ra khi lưu bài tập');
        setSubmitting(false);
        return;
      }

      if (onSuccess) {
        onSuccess(data?.assignment);
      }
    } catch {
      setFormError('Lỗi kết nối khi gửi dữ liệu bài tập.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" data-testid="assignment-form-card">
      <h3 style={{ marginBottom: '1.25rem', color: 'var(--primary)' }}>
        {assignmentId ? 'Chỉnh sửa bài tập' : 'Tạo bài tập mới'}
      </h3>

      {formError && (
        <div className="alert alert-danger" role="alert" data-testid="assignment-form-error">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate data-testid="assignment-form">
        <div className="form-group">
          <label className="form-label" htmlFor="assignment-title">
            Tiêu đề bài tập *
          </label>
          <input
            id="assignment-title"
            type="text"
            className="form-control"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ví dụ: Đảo ngược danh sách liên kết"
            required
            data-testid="assignment-title-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="assignment-desc">
            Mô tả đề bài & Ví dụ công khai
          </label>
          <textarea
            id="assignment-desc"
            className="form-control"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả yêu cầu bài toán, ví dụ minh họa input/output..."
            data-testid="assignment-desc-input"
          />
        </div>

        <div className="form-row">
          <div className="form-col form-group">
            <label className="form-label" htmlFor="assignment-mode">
              Chế độ bài tập *
            </label>
            <select
              id="assignment-mode"
              className="form-control"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'TEMPLATE' | 'FREE')}
              data-testid="assignment-mode-select"
            >
              <option value="TEMPLATE">Có Template (Sinh viên điền vùng code)</option>
              <option value="FREE">Tự do - Free Mode (Khai báo điểm vào)</option>
            </select>
          </div>

          <div className="form-col form-group">
            <label className="form-label" htmlFor="assignment-deadline">
              Hạn nộp bài (Deadline) *
            </label>
            <input
              id="assignment-deadline"
              type="datetime-local"
              className="form-control"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
              data-testid="assignment-deadline-input"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-col form-group">
            <label className="form-label" htmlFor="assignment-tl">
              Giới hạn thời gian - TL (ms) *
            </label>
            <input
              id="assignment-tl"
              type="number"
              className="form-control"
              value={timeLimitMs}
              onChange={(e) => setTimeLimitMs(e.target.value)}
              min={1}
              required
              data-testid="assignment-tl-input"
            />
          </div>

          <div className="form-col form-group">
            <label className="form-label" htmlFor="assignment-ml">
              Giới hạn bộ nhớ - ML (MB) *
            </label>
            <input
              id="assignment-ml"
              type="number"
              className="form-control"
              value={memoryLimitMb}
              onChange={(e) => setMemoryLimitMb(e.target.value)}
              min={1}
              required
              data-testid="assignment-ml-input"
            />
          </div>
        </div>

        {mode === 'TEMPLATE' ? (
          <div className="form-group" data-testid="template-mode-section">
            <label className="form-label" htmlFor="assignment-template-code">
              Khung mã nguồn Template (C++) *
            </label>
            <p style={{ fontSize: '0.8rem', color: 'var(--neutral-600)', marginBottom: '0.25rem' }}>
              Phải chứa ít nhất một cặp marker <code>// STUDENT_BEGIN &lt;tên_vùng&gt;</code> và{' '}
              <code>// STUDENT_END</code>.
            </p>
            <textarea
              id="assignment-template-code"
              className="form-control"
              rows={12}
              value={templateCode}
              onChange={(e) => setTemplateCode(e.target.value)}
              placeholder="#include <iostream>&#10;&#10;// STUDENT_BEGIN solve&#10;// Sinh viên viết code tại đây&#10;// STUDENT_END&#10;&#10;int main() { ... }"
              data-testid="assignment-template-input"
            />
          </div>
        ) : (
          <div className="alert alert-info" data-testid="free-mode-section">
            <p style={{ margin: 0 }}>
              Sinh viên nộp chương trình đầy đủ (có <code>main</code>); hệ thống chấm bằng so sánh
              output.
            </p>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end',
            marginTop: '1.5rem',
          }}
        >
          {onCancel && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              data-testid="cancel-assignment-btn"
            >
              Hủy
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            data-testid="submit-assignment-btn"
          >
            {submitting ? 'Đang lưu...' : 'Lưu bài tập'}
          </button>
        </div>
      </form>
    </div>
  );
}
