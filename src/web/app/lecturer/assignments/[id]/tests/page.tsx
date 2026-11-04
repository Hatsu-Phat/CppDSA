'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface TestCase {
  id: string;
  assignment_id: string;
  order_index: number;
  input_data: string;
  expected_output: string;
  is_hidden: boolean;
  is_sample: boolean;
}

interface Assignment {
  id: string;
  classroom_id: string;
  title: string;
  mode: string;
}

interface PairedTestItem {
  baseName: string;
  inputFile?: File;
  outputFile?: File;
  status: 'valid' | 'missing_input' | 'missing_output';
}

function extractTestFileInfo(filename: string): {
  type: 'input' | 'output' | 'unknown';
  base: string;
} {
  if (/\.(in|inp|input)$/i.test(filename)) {
    return { type: 'input', base: filename.replace(/\.(in|inp|input)$/i, '') };
  }
  if (/^input[_-]?(.*)\.txt$/i.test(filename)) {
    const m = filename.match(/^input[_-]?(.*)\.txt$/i);
    return { type: 'input', base: m && m[1] ? m[1] : filename.replace(/\.txt$/i, '') };
  }
  if (/\.(out|ans|ok|output)$/i.test(filename)) {
    return { type: 'output', base: filename.replace(/\.(out|ans|ok|output)$/i, '') };
  }
  if (/^(output|ans)[_-]?(.*)\.txt$/i.test(filename)) {
    const m = filename.match(/^(output|ans)[_-]?(.*)\.txt$/i);
    return { type: 'output', base: m && m[2] ? m[2] : filename.replace(/\.txt$/i, '') };
  }
  return { type: 'unknown', base: filename };
}

export default function AssignmentTestsPage() {
  const params = useParams();
  const assignmentId = params?.id as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [tests, setTests] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regradeNotice, setRegradeNotice] = useState<string | null>(null);
  const [regrading, setRegrading] = useState(false);

  // Add single test state (without orderIndex)
  const [inputData, setInputData] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [isHidden, setIsHidden] = useState(true);
  const [isSample, setIsSample] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bulk Import state
  const [pairedTests, setPairedTests] = useState<PairedTestItem[]>([]);
  const [orphanedFiles, setOrphanedFiles] = useState<string[]>([]);
  const [bulkHidden, setBulkHidden] = useState(true);
  const [bulkReplace, setBulkReplace] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Edit modal state (without orderIndex)
  const [editingTest, setEditingTest] = useState<TestCase | null>(null);
  const [editInput, setEditInput] = useState('');
  const [editExpected, setEditExpected] = useState('');
  const [editIsHidden, setEditIsHidden] = useState(true);
  const [editIsSample, setEditIsSample] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [assignRes, testsRes] = await Promise.all([
        fetch(`/api/assignments/${assignmentId}`),
        fetch(`/api/assignments/${assignmentId}/tests`),
      ]);

      if (!assignRes.ok) throw new Error('Không tìm thấy bài tập');
      const assignData = await assignRes.json();
      setAssignment(assignData.assignment);

      if (testsRes.ok) {
        const testsData = await testsRes.json();
        setTests(testsData.testCases || []);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải dữ liệu bài tập hoặc test case');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    if (assignmentId) {
      fetchData();
    }
  }, [assignmentId, fetchData]);

  // Handle Regrade All Submissions
  const handleRegradeAll = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn chấm lại toàn bộ bài nộp của bài tập này?')) {
      return;
    }
    setRegrading(true);
    setRegradeNotice(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/regrade`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setRegradeNotice(`Đã xếp hàng chấm lại thành công ${data.queued ?? 0} bài nộp.`);
      } else {
        setError(data?.message || 'Không thể xếp hàng chấm lại');
      }
    } catch {
      setError('Lỗi kết nối khi gửi yêu cầu chấm lại');
    } finally {
      setRegrading(false);
    }
  };

  // Handle Add Single Test
  const handleAddTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (inputData === undefined || expectedOutput === undefined) {
      setAddError('Dữ liệu input và expected output là bắt buộc');
      return;
    }

    setSubmitting(true);

    try {
      const payload: any = {
        inputData,
        expectedOutput,
        isHidden,
        isSample,
      };

      const res = await fetch(`/api/assignments/${assignmentId}/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setAddError(data?.message || data?.error || 'Không thể tạo test case');
        setSubmitting(false);
        return;
      }

      setInputData('');
      setExpectedOutput('');
      setIsHidden(true);
      setIsSample(false);
      await fetchData();
    } catch {
      setAddError('Lỗi kết nối khi thêm test case.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle File Selection for Bulk Import
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    setBulkError(null);
    setBulkSuccess(null);
    if (!files || files.length === 0) {
      setPairedTests([]);
      setOrphanedFiles([]);
      return;
    }

    const map = new Map<string, { inputFile?: File; outputFile?: File }>();
    const unparsed: string[] = [];

    Array.from(files).forEach((file) => {
      const { type, base } = extractTestFileInfo(file.name);
      if (type === 'unknown') {
        unparsed.push(file.name);
        return;
      }
      const existing = map.get(base) || {};
      if (type === 'input') existing.inputFile = file;
      if (type === 'output') existing.outputFile = file;
      map.set(base, existing);
    });

    const sortedBases = Array.from(map.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    const pairs: PairedTestItem[] = [];
    const orphans: string[] = [...unparsed];

    sortedBases.forEach((base) => {
      const item = map.get(base)!;
      if (item.inputFile && item.outputFile) {
        pairs.push({
          baseName: base,
          inputFile: item.inputFile,
          outputFile: item.outputFile,
          status: 'valid',
        });
      } else if (item.inputFile && !item.outputFile) {
        orphans.push(`${item.inputFile.name} (thiếu file output)`);
      } else if (!item.inputFile && item.outputFile) {
        orphans.push(`${item.outputFile.name} (thiếu file input)`);
      }
    });

    setPairedTests(pairs);
    setOrphanedFiles(orphans);
  };

  // Handle Bulk Upload Submission
  const handleBulkUpload = async () => {
    if (pairedTests.length === 0) {
      setBulkError('Chưa có cặp test case hợp lệ nào được chọn');
      return;
    }

    setBulkUploading(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      const testsPayload = await Promise.all(
        pairedTests.map(async (pair) => {
          const inText = await pair.inputFile!.text();
          const outText = await pair.outputFile!.text();
          return {
            inputData: inText,
            expectedOutput: outText,
            isHidden: bulkHidden,
            isSample: false,
          };
        })
      );

      const res = await fetch(`/api/assignments/${assignmentId}/tests/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tests: testsPayload,
          replace: bulkReplace,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.error === 'TOO_MANY_TEST_CASES') {
          setBulkError('Tổng số test case không được vượt quá 50 test.');
        } else if (data?.error === 'PAYLOAD_TOO_LARGE') {
          setBulkError('Kích thước file test vượt quá giới hạn cho phép (tối đa 1 MB / file).');
        } else {
          setBulkError(data?.message || 'Lỗi khi nhập bộ test');
        }
        setBulkUploading(false);
        return;
      }

      setBulkSuccess(`Đã nhập thành công ${data.count ?? pairedTests.length} test case!`);
      setPairedTests([]);
      setOrphanedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchData();
    } catch {
      setBulkError('Lỗi kết nối khi tải lên bộ test.');
    } finally {
      setBulkUploading(false);
    }
  };

  const handleDeleteTest = async (testId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa test case này?')) return;

    try {
      const res = await fetch(`/api/tests/${testId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.message || 'Không thể xóa test case');
      }
    } catch {
      alert('Lỗi kết nối khi xóa test case');
    }
  };

  const openEditModal = (t: TestCase) => {
    setEditingTest(t);
    setEditInput(t.input_data);
    setEditExpected(t.expected_output);
    setEditIsHidden(t.is_hidden);
    setEditIsSample(t.is_sample);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTest) return;
    setEditError(null);
    setEditSubmitting(true);

    try {
      const payload: any = {
        inputData: editInput,
        expectedOutput: editExpected,
        isHidden: editIsHidden,
        isSample: editIsSample,
      };

      const res = await fetch(`/api/tests/${editingTest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setEditError(data?.message || 'Không thể cập nhật test case');
        setEditSubmitting(false);
        return;
      }

      setEditingTest(null);
      await fetchData();
    } catch {
      setEditError('Lỗi kết nối khi cập nhật test case');
    } finally {
      setEditSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Đang tải danh sách test case...</p>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="alert alert-danger" role="alert">
        {error || 'Không tìm thấy thông tin bài tập'}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ marginBottom: '0.25rem' }}>
            <Link
              href={`/lecturer/classrooms/${assignment.classroom_id}`}
              style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}
            >
              ← Về chi tiết lớp học
            </Link>
          </div>
          <h2 data-testid="assignment-title">Bộ kiểm thử: {assignment.title}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Quản lý các test ẩn dùng để chấm điểm tự động cho bài tập (tối đa 50 test case).
          </p>
        </div>

        <div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRegradeAll}
            disabled={regrading}
            data-testid="regrade-all-btn"
          >
            {regrading ? 'Đang chấm lại...' : 'Chấm lại tất cả bài nộp'}
          </button>
        </div>
      </div>

      {regradeNotice && (
        <div className="alert alert-success" role="alert" data-testid="regrade-notice">
          {regradeNotice}
        </div>
      )}

      {/* 1. Bulk Tests Import Card */}
      <div className="card" data-testid="bulk-import-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--primary)' }}>
          Nhập bộ test từ file hoặc thư mục
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Hỗ trợ chọn nhiều file hoặc cả thư mục (hệ thống không hỗ trợ file .zip). Các file tự động
          ghép cặp theo tên gốc: đầu vào <code>.in</code>, <code>.inp</code>, <code>.input</code>,{' '}
          <code>input*.txt</code> ghép với đầu ra <code>.out</code>, <code>.ans</code>,{' '}
          <code>.ok</code>, <code>.output</code>, <code>output*.txt</code> (ví dụ <code>1.in</code>{' '}
          + <code>1.out</code>, <code>test01.inp</code> + <code>test01.out</code>).
        </p>

        {bulkError && (
          <div className="alert alert-danger" role="alert" data-testid="bulk-error">
            {bulkError}
          </div>
        )}

        {bulkSuccess && (
          <div className="alert alert-success" role="alert" data-testid="bulk-success">
            {bulkSuccess}
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="bulk-file-input">
            Chọn các file test hoặc thư mục:
          </label>
          <input
            id="bulk-file-input"
            ref={fileInputRef}
            type="file"
            multiple
            className="form-control"
            onChange={handleFilesSelected}
            data-testid="bulk-file-input"
          />
        </div>

        {/* Preview Table */}
        {pairedTests.length > 0 && (
          <div
            style={{ marginTop: '1rem', marginBottom: '1rem' }}
            data-testid="bulk-preview-section"
          >
            <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              Xem trước các cặp test ({pairedTests.length} cặp hợp lệ)
            </h4>

            <div className="table-responsive">
              <table className="table" data-testid="bulk-preview-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>STT</th>
                    <th>Tên gốc (Base)</th>
                    <th>File đầu vào (Input)</th>
                    <th>File đầu ra (Output)</th>
                    <th style={{ width: '120px' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {pairedTests.map((pair, idx) => (
                    <tr key={pair.baseName} data-testid={`preview-row-${idx}`}>
                      <td>#{idx + 1}</td>
                      <td>
                        <strong>{pair.baseName}</strong>
                      </td>
                      <td>{pair.inputFile?.name}</td>
                      <td>{pair.outputFile?.name}</td>
                      <td>
                        <span className="badge badge-ac">Hợp lệ</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Orphaned files warning */}
        {orphanedFiles.length > 0 && (
          <div className="alert alert-warning" role="alert" data-testid="orphaned-files-warning">
            <strong>Cảnh báo: Có {orphanedFiles.length} file lẻ không ghép được cặp:</strong>
            <ul style={{ marginTop: '0.4rem', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
              {orphanedFiles.map((fname, idx) => (
                <li key={idx}>{fname}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Options & Action */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              <input
                type="checkbox"
                checked={bulkHidden}
                onChange={(e) => setBulkHidden(e.target.checked)}
                data-testid="bulk-hidden-checkbox"
              />
              Ẩn với sinh viên (mặc định)
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              <input
                type="checkbox"
                checked={bulkReplace}
                onChange={(e) => setBulkReplace(e.target.checked)}
                data-testid="bulk-replace-checkbox"
              />
              Thay toàn bộ test cũ
            </label>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleBulkUpload}
            disabled={pairedTests.length === 0 || bulkUploading}
            data-testid="bulk-upload-btn"
          >
            {bulkUploading ? 'Đang tải lên...' : `Tải lên ${pairedTests.length} test case`}
          </button>
        </div>
      </div>

      {/* 2. Existing Tests List */}
      <div className="card" data-testid="test-cases-list">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>
          Danh sách Test Cases hiện có ({tests.length})
        </h3>

        {tests.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>
            Bài tập chưa có test case nào. Hãy thêm test case hoặc nhập bộ test từ file.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="table" data-testid="test-cases-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Thứ tự</th>
                  <th style={{ width: '130px' }}>Phân loại</th>
                  <th>Đầu vào (Input)</th>
                  <th>Kỳ vọng (Expected Output)</th>
                  <th style={{ width: '150px', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t, idx) => {
                  const displayIndex = t.order_index !== undefined ? t.order_index : idx + 1;
                  return (
                    <tr key={t.id} data-testid={`test-row-${t.id}`}>
                      <td>
                        <strong>#{displayIndex}</strong>
                      </td>
                      <td>
                        {t.is_hidden ? (
                          <span className="badge badge-pending">Test ẩn</span>
                        ) : (
                          <span className="badge badge-ac">Công khai</span>
                        )}
                        {t.is_sample && (
                          <span className="badge badge-primary" style={{ marginLeft: '4px' }}>
                            Mẫu
                          </span>
                        )}
                      </td>
                      <td>
                        <pre
                          style={{
                            background: 'var(--bg-page)',
                            padding: '0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            maxHeight: '100px',
                            overflow: 'auto',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                          }}
                          data-testid={`test-input-${displayIndex}`}
                        >
                          {t.input_data}
                        </pre>
                      </td>
                      <td>
                        <pre
                          style={{
                            background: 'var(--bg-page)',
                            padding: '0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            maxHeight: '100px',
                            overflow: 'auto',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                          }}
                          data-testid={`test-expected-${displayIndex}`}
                        >
                          {t.expected_output}
                        </pre>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditModal(t)}
                          style={{ marginRight: '0.4rem' }}
                          data-testid={`edit-test-btn-${t.id}`}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteTest(t.id)}
                          data-testid={`delete-test-btn-${t.id}`}
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Add Single Test Case Form (without orderIndex) */}
      <div className="card" data-testid="add-test-card">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>
          + Thêm một Test Case thủ công
        </h3>

        {addError && (
          <div className="alert alert-danger" role="alert" data-testid="add-test-error">
            {addError}
          </div>
        )}

        <form onSubmit={handleAddTest} data-testid="add-test-form">
          <div className="form-row">
            <div className="form-col form-group">
              <label className="form-label" htmlFor="new-test-input">
                Dữ liệu đầu vào (Input Data) *
              </label>
              <textarea
                id="new-test-input"
                className="form-control"
                rows={5}
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder="Ví dụ: 4&#10;1 2 3 4"
                required
                data-testid="new-test-input"
              />
            </div>

            <div className="form-col form-group">
              <label className="form-label" htmlFor="new-test-expected">
                Kết quả kỳ vọng (Expected Output) *
              </label>
              <textarea
                id="new-test-expected"
                className="form-control"
                rows={5}
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                placeholder="Ví dụ: 4 3 2 1"
                required
                data-testid="new-test-expected"
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '2rem',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              <input
                type="checkbox"
                checked={isHidden}
                onChange={(e) => setIsHidden(e.target.checked)}
                data-testid="new-test-hidden-checkbox"
              />
              Test ẩn (Chỉ dùng khi chấm bài)
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              <input
                type="checkbox"
                checked={isSample}
                onChange={(e) => setIsSample(e.target.checked)}
                data-testid="new-test-sample-checkbox"
              />
              Ví dụ mẫu công khai
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            data-testid="submit-new-test-btn"
          >
            {submitting ? 'Đang thêm...' : 'Lưu Test Case'}
          </button>
        </form>
      </div>

      {/* Edit Test Modal (without orderIndex) */}
      {editingTest && (
        <div className="modal-backdrop" onClick={() => setEditingTest(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '600px' }}
          >
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>
              Chỉnh sửa Test Case #{editingTest.order_index}
            </h3>

            {editError && (
              <div className="alert alert-danger" role="alert">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label">Dữ liệu đầu vào (Input Data) *</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={editInput}
                  onChange={(e) => setEditInput(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kết quả kỳ vọng (Expected Output) *</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={editExpected}
                  onChange={(e) => setEditExpected(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={editIsHidden}
                    onChange={(e) => setEditIsHidden(e.target.checked)}
                  />
                  Test ẩn
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={editIsSample}
                    onChange={(e) => setEditIsSample(e.target.checked)}
                  />
                  Ví dụ mẫu
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingTest(null)}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                  {editSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
