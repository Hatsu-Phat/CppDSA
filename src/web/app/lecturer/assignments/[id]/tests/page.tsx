'use client';

import React, { useEffect, useState, useCallback } from 'react';
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

export default function AssignmentTestsPage() {
  const params = useParams();
  const assignmentId = params?.id as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [tests, setTests] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [inputData, setInputData] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [isHidden, setIsHidden] = useState(true);
  const [isSample, setIsSample] = useState(false);
  const [orderIndex, setOrderIndex] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit modal state
  const [editingTest, setEditingTest] = useState<TestCase | null>(null);
  const [editInput, setEditInput] = useState('');
  const [editExpected, setEditExpected] = useState('');
  const [editIsHidden, setEditIsHidden] = useState(true);
  const [editIsSample, setEditIsSample] = useState(false);
  const [editOrder, setEditOrder] = useState<number | string>('');
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
      if (orderIndex.trim()) {
        payload.orderIndex = Number(orderIndex);
      }

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
      setOrderIndex('');
      setIsHidden(true);
      setIsSample(false);
      await fetchData();
    } catch {
      setAddError('Lỗi kết nối khi thêm test case.');
    } finally {
      setSubmitting(false);
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
    setEditOrder(t.order_index);
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
        orderIndex: Number(editOrder),
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.25rem',
            }}
          >
            <Link
              href={`/lecturer/classrooms/${assignment.classroom_id}`}
              style={{ fontSize: '0.875rem', color: 'var(--neutral-600)' }}
            >
              ← Về chi tiết lớp học
            </Link>
          </div>
          <h2 data-testid="assignment-title">Bộ kiểm thử: {assignment.title}</h2>
          <p style={{ color: 'var(--neutral-600)', fontSize: '0.875rem' }}>
            Quản lý các test ẩn dùng để chấm điểm tự động cho bài tập (tối đa 50 test case ẩn).
          </p>
        </div>
      </div>

      {/* Tests Table */}
      <div className="card" data-testid="test-cases-list">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>
          Danh sách Test Cases hiện có ({tests.length})
        </h3>

        {tests.length === 0 ? (
          <p style={{ color: 'var(--neutral-600)', padding: '1rem 0' }}>
            Bài tập chưa có test case nào. Hãy thêm test case ở biểu mẫu bên dưới.
          </p>
        ) : (
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
              {tests.map((t) => (
                <tr key={t.id} data-testid={`test-row-${t.id}`}>
                  <td>
                    <strong>#{t.order_index}</strong>
                  </td>
                  <td>
                    {t.is_hidden ? (
                      <span className="badge badge-pending">Test ẩn</span>
                    ) : (
                      <span className="badge badge-completed">Công khai</span>
                    )}
                    {t.is_sample && (
                      <span className="badge badge-ac" style={{ marginLeft: '4px' }}>
                        Mẫu
                      </span>
                    )}
                  </td>
                  <td>
                    <pre
                      style={{
                        background: '#f8fafc',
                        padding: '0.4rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        maxHeight: '100px',
                        overflow: 'auto',
                      }}
                      data-testid={`test-input-${t.order_index}`}
                    >
                      {t.input_data}
                    </pre>
                  </td>
                  <td>
                    <pre
                      style={{
                        background: '#f8fafc',
                        padding: '0.4rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        maxHeight: '100px',
                        overflow: 'auto',
                      }}
                      data-testid={`test-expected-${t.order_index}`}
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add New Test Form */}
      <div className="card" data-testid="add-test-card">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>
          + Thêm Test Case mới
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

          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '1rem' }}>
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
              Test ẩn (Chỉ dùng khi chấm bài, không công khai cho sinh viên)
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
              Ví dụ mẫu
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--neutral-700)' }}>Thứ tự:</span>
              <input
                type="number"
                className="form-control"
                style={{ width: '80px', padding: '0.25rem 0.5rem' }}
                value={orderIndex}
                onChange={(e) => setOrderIndex(e.target.value)}
                placeholder="Tự động"
                data-testid="new-test-order"
              />
            </div>
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

      {/* Edit Test Modal */}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Thứ tự:</span>
                  <input
                    type="number"
                    className="form-control"
                    style={{ width: '80px', padding: '0.2rem 0.5rem' }}
                    value={editOrder}
                    onChange={(e) => setEditOrder(e.target.value)}
                  />
                </div>
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
