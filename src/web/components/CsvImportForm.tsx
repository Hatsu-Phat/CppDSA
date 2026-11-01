'use client';

import React, { useState } from 'react';

export interface CsvImportError {
  row: number;
  error: string;
}

export interface CreatedStudentPassword {
  studentCode: string;
  email: string;
  temporaryPassword: string;
}

export interface CsvImportResult {
  successCount: number;
  errorCount: number;
  errors: CsvImportError[];
  students?: Array<{
    studentCode: string;
    email: string;
    status: string;
    temporaryPassword?: string;
  }>;
  createdStudents?: CreatedStudentPassword[];
}

interface CsvImportFormProps {
  classroomId: string;
  onImportSuccess?: () => void;
}

export default function CsvImportForm({ classroomId, onImportSuccess }: CsvImportFormProps) {
  const [csvContent, setCsvContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
    };
    reader.readAsText(file);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setResult(null);

    const trimmed = csvContent.trim();
    if (!trimmed) {
      setGeneralError('Vui lòng nhập hoặc chọn file CSV');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/classrooms/${classroomId}/students/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: trimmed }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setGeneralError(data?.message || 'Lỗi khi nhập dữ liệu CSV');
        setLoading(false);
        return;
      }

      setResult(data);
      if (data.successCount > 0 && onImportSuccess) {
        onImportSuccess();
      }
    } catch {
      setGeneralError('Lỗi kết nối khi gửi dữ liệu CSV.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" data-testid="csv-import-section">
      <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--primary)' }}>
        Nhập danh sách sinh viên qua CSV
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)', marginBottom: '1rem' }}>
        Định dạng CSV yêu cầu dòng tiêu đề: <code>student_code,full_name,email</code> (tối đa 500
        dòng).
      </p>

      {generalError && (
        <div className="alert alert-danger" role="alert" data-testid="csv-general-error">
          {generalError}
        </div>
      )}

      {result && (
        <div style={{ marginBottom: '1.5rem' }}>
          {result.successCount > 0 && (
            <div className="alert alert-success" role="alert" data-testid="csv-success-alert">
              Đã ghi danh thành công {result.successCount} sinh viên vào lớp.
            </div>
          )}

          {result.errorCount > 0 && (
            <div className="alert alert-danger" role="alert" data-testid="csv-errors-alert">
              <strong>Có {result.errorCount} dòng dữ liệu bị lỗi:</strong>
              <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                {result.errors.map((err, idx) => (
                  <li key={idx} data-testid="csv-error-item">
                    <strong>Dòng {err.row}:</strong> {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.createdStudents && result.createdStudents.length > 0 && (
            <div
              className="alert alert-warning"
              role="region"
              data-testid="created-passwords-section"
              style={{ marginTop: '1rem' }}
            >
              <h4 style={{ marginBottom: '0.5rem', color: 'var(--warning)' }}>
                Bảng mật khẩu tạm thời cho tài khoản mới (Chỉ hiển thị một lần):
              </h4>
              <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                Vui lòng sao chép lại thông tin đăng nhập này gửi cho sinh viên. Sinh viên sẽ phải
                đổi mật khẩu ở lần đăng nhập đầu tiên.
              </p>

              <table
                className="table"
                data-testid="created-passwords-table"
                style={{ background: '#ffffff', borderRadius: '4px' }}
              >
                <thead>
                  <tr>
                    <th>Mã SV</th>
                    <th>Email</th>
                    <th>Mật khẩu tạm</th>
                  </tr>
                </thead>
                <tbody>
                  {result.createdStudents.map((st) => (
                    <tr key={st.studentCode} data-testid="temp-password-row">
                      <td data-testid="student-code">
                        <strong>{st.studentCode}</strong>
                      </td>
                      <td>{st.email}</td>
                      <td>
                        <code
                          style={{
                            background: '#f1f5f9',
                            padding: '0.2rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            color: '#0f172a',
                          }}
                          data-testid={`temp-password-${st.studentCode}`}
                        >
                          {st.temporaryPassword}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleImport}>
        <div className="form-group">
          <label className="form-label" htmlFor="csv-file-input">
            Chọn tệp tin .CSV:
          </label>
          <input
            id="csv-file-input"
            type="file"
            accept=".csv,text/csv"
            className="form-control"
            onChange={handleFileUpload}
            data-testid="csv-file-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="csv-textarea">
            Hoặc dán nội dung CSV vào ô dưới đây:
          </label>
          <textarea
            id="csv-textarea"
            className="form-control"
            rows={5}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder="student_code,full_name,email&#10;2026001,Nguyen Van A,student1@cppdsa.local&#10;2026002,Tran Thi B,student2@cppdsa.local"
            data-testid="csv-textarea"
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          data-testid="import-csv-submit"
        >
          {loading ? 'Đang xử lý CSV...' : 'Tải lên danh sách sinh viên'}
        </button>
      </form>
    </div>
  );
}
