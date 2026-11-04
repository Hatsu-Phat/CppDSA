'use client';

import React, { useState, useRef } from 'react';

export interface AssignmentFormData {
  title: string;
  description?: string;
  mode: 'TEMPLATE' | 'FREE';
  timeLimitMs: number;
  memoryLimitMb: number;
  deadline: string;
  templateCode?: string;
  entryPointSpec?: any;
  statement?: { name: string; size: number } | null;
  statementFile?: File | null;
  removeStatement?: boolean;
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [currentStatement] = useState<{ name: string; size: number } | null>(
    initialData?.statement || null
  );
  const [removeStatement, setRemoveStatement] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFormError('Chỉ chấp nhận file định dạng PDF (.pdf)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('Dung lượng file PDF vượt quá giới hạn 10 MB');
      return;
    }
    setFormError(null);
    setPdfFile(file);
    setRemoveStatement(false);
  };

  const handleRemoveFile = () => {
    setPdfFile(null);
    if (currentStatement) {
      setRemoveStatement(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
      description: description.trim() || undefined,
      mode,
      timeLimitMs: tl,
      memoryLimitMb: ml,
      deadline: new Date(deadline).toISOString(),
      templateCode: mode === 'TEMPLATE' ? templateCode : undefined,
      statementFile: pdfFile,
      removeStatement,
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
        body: JSON.stringify({
          title: payload.title,
          description: payload.description,
          mode: payload.mode,
          timeLimitMs: payload.timeLimitMs,
          memoryLimitMb: payload.memoryLimitMb,
          deadline: payload.deadline,
          templateCode: payload.templateCode,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setFormError(data?.message || data?.error || 'Có lỗi xảy ra khi lưu bài tập');
        setSubmitting(false);
        return;
      }

      const targetAssignmentId = assignmentId || data?.assignment?.id;

      // Handle PDF upload or delete
      if (targetAssignmentId) {
        if (pdfFile) {
          const uploadRes = await fetch(`/api/assignments/${targetAssignmentId}/statement`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/pdf',
              'X-File-Name': encodeURIComponent(pdfFile.name),
            },
            body: pdfFile,
          });

          if (!uploadRes.ok) {
            const uploadErr = await uploadRes.json().catch(() => null);
            setFormError(
              uploadErr?.message || 'Bài tập đã được lưu nhưng không thể tải lên file đề bài PDF'
            );
            setSubmitting(false);
            return;
          }
        } else if (removeStatement && assignmentId) {
          await fetch(`/api/assignments/${assignmentId}/statement`, {
            method: 'DELETE',
          });
        }
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

        {/* Đề bài (PDF) Section */}
        <div className="form-group" data-testid="statement-pdf-section">
          <label className="form-label">Đề bài (PDF)</label>

          {pdfFile ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius)',
                background: 'var(--bg-page)',
              }}
              data-testid="pdf-file-info"
            >
              <div>
                <strong>{pdfFile.name}</strong>{' '}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  ({formatFileSize(pdfFile.size)})
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleRemoveFile}
                data-testid="remove-pdf-btn"
              >
                Xóa file
              </button>
            </div>
          ) : currentStatement && !removeStatement ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius)',
                background: 'var(--bg-page)',
              }}
              data-testid="pdf-file-info"
            >
              <div>
                <strong>{currentStatement.name}</strong>{' '}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  ({formatFileSize(currentStatement.size)} · Đã lưu)
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleRemoveFile}
                data-testid="remove-pdf-btn"
              >
                Xóa file PDF
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileChange(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border-color)'}`,
                borderRadius: 'var(--border-radius)',
                padding: '1.5rem',
                textAlign: 'center',
                background: isDragging ? 'rgba(25, 118, 210, 0.05)' : 'transparent',
                cursor: 'pointer',
              }}
              data-testid="pdf-dropzone"
            >
              <input
                ref={fileInputRef}
                id="assignment-pdf-input"
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileChange(file);
                }}
                data-testid="assignment-pdf-input"
              />
              <p style={{ margin: '0 0 0.25rem 0', fontWeight: 500, color: 'var(--text-main)' }}>
                Kéo thả file PDF đề bài vào đây, hoặc bấm để chọn file
              </p>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Chỉ chấp nhận file định dạng PDF, tối đa 10 MB
              </span>
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="assignment-desc">
            Ghi chú thêm (không bắt buộc)
          </label>
          <textarea
            id="assignment-desc"
            className="form-control"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ghi chú bổ sung hoặc hướng dẫn thêm cho sinh viên..."
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
