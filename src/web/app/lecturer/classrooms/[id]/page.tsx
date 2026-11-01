'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import CsvImportForm from '@/components/CsvImportForm';

interface Classroom {
  id: string;
  name: string;
  description: string | null;
}

interface Student {
  id: string;
  studentCode: string;
  fullName: string;
  email: string;
  enrolledAt: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  mode: 'TEMPLATE' | 'FREE';
  time_limit_ms: number;
  memory_limit_mb: number;
  deadline: string;
  created_at: string;
}

interface SubmissionItem {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentEmail: string;
  status: string;
  score: number | null;
  passedTests: number;
  totalTests: number;
  isLate: boolean;
  createdAt: string;
}

interface SubmissionDetail {
  id: string;
  assignmentId: string;
  studentId: string;
  submittedCode: string;
  entryPointDeclaration?: any;
  status: string;
  score: number | null;
  passedTests: number;
  totalTests: number;
  isLate: boolean;
  compileOutput: string | null;
  createdAt: string;
  tests: Array<{
    testCaseId: string;
    orderIndex: number;
    verdict: string;
    executionTimeMs: number;
    memoryUsedKb: number;
    studentOutputExcerpt: string | null;
  }>;
}

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [activeTab, setActiveTab] = useState<'students' | 'assignments' | 'submissions'>(
    'students'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Students state
  const [students, setStudents] = useState<Student[]>([]);
  const [resetPwdResult, setResetPwdResult] = useState<{
    studentCode: string;
    tempPassword: string;
  } | null>(null);
  const [resetPwdError, setResetPwdError] = useState<string | null>(null);

  // Assignments state
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Submissions state
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [filterAssignmentId, setFilterAssignmentId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMinScore, setFilterMinScore] = useState('');
  const [filterMaxScore, setFilterMaxScore] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Submission detail modal
  const [selectedSubDetail, setSelectedSubDetail] = useState<SubmissionDetail | null>(null);

  const fetchClassroomData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/classrooms/${classroomId}`);
      if (!res.ok) throw new Error('Không tìm thấy lớp học');
      const data = await res.json();
      setClassroom(data.classroom);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải thông tin lớp học');
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/students`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
      }
    } catch {
      // non-fatal
    }
  }, [classroomId]);

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/assignments`);
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments || []);
      }
    } catch {
      // non-fatal
    }
  }, [classroomId]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (filterAssignmentId) q.set('assignmentId', filterAssignmentId);
      if (filterStatus) q.set('status', filterStatus);
      if (filterMinScore) q.set('minScore', filterMinScore);
      if (filterMaxScore) q.set('maxScore', filterMaxScore);
      if (filterFrom) q.set('from', new Date(filterFrom).toISOString());
      if (filterTo) q.set('to', new Date(filterTo).toISOString());

      const url = `/api/classrooms/${classroomId}/submissions${q.toString() ? '?' + q.toString() : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch {
      // non-fatal
    }
  }, [
    classroomId,
    filterAssignmentId,
    filterStatus,
    filterMinScore,
    filterMaxScore,
    filterFrom,
    filterTo,
  ]);

  useEffect(() => {
    if (classroomId) {
      fetchClassroomData();
      fetchStudents();
      fetchAssignments();
      fetchSubmissions();
    }
  }, [classroomId, fetchClassroomData, fetchStudents, fetchAssignments, fetchSubmissions]);

  useEffect(() => {
    if (activeTab === 'students') {
      fetchStudents();
    } else if (activeTab === 'assignments') {
      fetchAssignments();
    } else if (activeTab === 'submissions') {
      fetchSubmissions();
    }
  }, [activeTab, fetchStudents, fetchAssignments, fetchSubmissions]);

  const handleResetPassword = async (studentId: string, studentCode: string) => {
    setResetPwdResult(null);
    setResetPwdError(null);

    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/students/${studentId}/reset-password`,
        {
          method: 'POST',
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setResetPwdError(data?.message || 'Không thể đặt lại mật khẩu cho sinh viên');
        return;
      }

      setResetPwdResult({
        studentCode,
        tempPassword: data.temporaryPassword,
      });
    } catch {
      setResetPwdError('Lỗi kết nối khi đặt lại mật khẩu');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string, title: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bài tập "${title}"?`)) return;

    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAssignments();
        await fetchSubmissions();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.message || 'Không thể xóa bài tập');
      }
    } catch {
      alert('Lỗi kết nối khi xóa bài tập');
    }
  };

  const handleViewSubmissionDetail = async (subId: string) => {
    setSelectedSubDetail(null);

    try {
      const res = await fetch(`/api/submissions/${subId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSubDetail(data.submission);
      } else {
        alert('Không thể tải chi tiết bài nộp');
      }
    } catch {
      alert('Lỗi kết nối khi tải chi tiết bài nộp');
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Đang tải thông tin lớp học...</p>
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="alert alert-danger" role="alert">
        {error || 'Không tìm thấy lớp học'}
        <div style={{ marginTop: '1rem' }}>
          <Link href="/lecturer" className="btn btn-secondary btn-sm">
            ← Quay lại danh sách lớp
          </Link>
        </div>
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
            <Link href="/lecturer" style={{ fontSize: '0.875rem', color: 'var(--neutral-600)' }}>
              Lớp học
            </Link>
            <span style={{ color: 'var(--neutral-600)' }}>/</span>
            <span style={{ fontSize: '0.875rem', color: 'var(--neutral-700)', fontWeight: 600 }}>
              {classroom.name}
            </span>
          </div>
          <h2 data-testid="classroom-title">{classroom.name}</h2>
          {classroom.description && (
            <p style={{ color: 'var(--neutral-600)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {classroom.description}
            </p>
          )}
        </div>

        <Link href="/lecturer" className="btn btn-secondary btn-sm">
          ← Danh sách lớp
        </Link>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab-item ${activeTab === 'students' ? 'active' : ''}`}
          onClick={() => setActiveTab('students')}
          data-testid="tab-students"
        >
          Sinh viên ({students.length})
        </button>
        <button
          type="button"
          className={`tab-item ${activeTab === 'assignments' ? 'active' : ''}`}
          onClick={() => setActiveTab('assignments')}
          data-testid="tab-assignments"
        >
          Bài tập ({assignments.length})
        </button>
        <button
          type="button"
          className={`tab-item ${activeTab === 'submissions' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('submissions');
            fetchSubmissions();
          }}
          data-testid="tab-submissions"
        >
          Bài nộp & Điểm ({submissions.length})
        </button>
      </div>

      {/* TAB 1: STUDENTS */}
      {activeTab === 'students' && (
        <div>
          {resetPwdError && (
            <div className="alert alert-danger" role="alert">
              {resetPwdError}
            </div>
          )}

          {resetPwdResult && (
            <div className="alert alert-warning" role="region" data-testid="reset-password-alert">
              <strong>
                Đặt lại mật khẩu thành công cho sinh viên {resetPwdResult.studentCode}!
              </strong>
              <div style={{ marginTop: '0.5rem' }}>
                Mật khẩu tạm thời mới (chỉ hiển thị một lần):{' '}
                <code
                  style={{
                    background: '#ffffff',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    color: 'var(--neutral-900)',
                  }}
                  data-testid="reset-temp-password-code"
                >
                  {resetPwdResult.tempPassword}
                </code>
              </div>
            </div>
          )}

          {/* Student list table */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>
              Danh sách sinh viên trong lớp
            </h3>

            {students.length === 0 ? (
              <p style={{ color: 'var(--neutral-600)', padding: '1rem 0' }}>
                Chưa có sinh viên nào trong lớp. Hãy nhập danh sách qua file CSV bên dưới.
              </p>
            ) : (
              <table className="table" data-testid="students-table">
                <thead>
                  <tr>
                    <th>Mã SV</th>
                    <th>Họ và tên</th>
                    <th>Email</th>
                    <th>Ngày ghi danh</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st) => (
                    <tr key={st.id} data-testid={`student-row-${st.studentCode}`}>
                      <td>
                        <strong>{st.studentCode}</strong>
                      </td>
                      <td>{st.fullName}</td>
                      <td>{st.email}</td>
                      <td>{new Date(st.enrolledAt).toLocaleDateString('vi-VN')}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleResetPassword(st.id, st.studentCode)}
                          data-testid={`reset-pwd-btn-${st.studentCode}`}
                        >
                          Đặt lại mật khẩu
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* CSV Import Component */}
          <CsvImportForm classroomId={classroomId} onImportSuccess={fetchStudents} />
        </div>
      )}

      {/* TAB 2: ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>Các bài tập thực hành</h3>
            <Link
              href={`/lecturer/classrooms/${classroomId}/assignments/new`}
              className="btn btn-primary btn-sm"
              data-testid="create-assignment-btn"
            >
              + Tạo bài tập mới
            </Link>
          </div>

          {assignments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--neutral-600)', marginBottom: '1rem' }}>
                Lớp này chưa có bài tập nào. Hãy tạo bài tập đầu tiên!
              </p>
              <Link
                href={`/lecturer/classrooms/${classroomId}/assignments/new`}
                className="btn btn-primary"
              >
                Tạo bài tập mới
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="card"
                  data-testid={`assignment-card-${a.id}`}
                  style={{ marginBottom: 0 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <h4 style={{ fontSize: '1.15rem', color: 'var(--neutral-900)' }}>
                          {a.title}
                        </h4>
                        <span className="badge badge-pending">
                          {a.mode === 'TEMPLATE' ? 'Template Mode' : 'Free Mode'}
                        </span>
                      </div>

                      <p
                        style={{
                          color: 'var(--neutral-600)',
                          fontSize: '0.875rem',
                          marginBottom: '0.75rem',
                        }}
                      >
                        {a.description || 'Chưa có mô tả.'}
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          gap: '1.5rem',
                          fontSize: '0.8rem',
                          color: 'var(--neutral-600)',
                        }}
                      >
                        <span>⏱ TL: {a.time_limit_ms} ms</span>
                        <span>💾 ML: {a.memory_limit_mb} MB</span>
                        <span>📅 Hạn: {new Date(a.deadline).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Link
                        href={`/lecturer/assignments/${a.id}/tests`}
                        className="btn btn-primary btn-sm"
                        data-testid={`manage-tests-btn-${a.id}`}
                      >
                        Quản lý Test ẩn
                      </Link>
                      <Link
                        href={`/lecturer/assignments/${a.id}/edit`}
                        className="btn btn-secondary btn-sm"
                        data-testid={`edit-assignment-btn-${a.id}`}
                      >
                        Sửa
                      </Link>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteAssignment(a.id, a.title)}
                        data-testid={`delete-assignment-btn-${a.id}`}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUBMISSIONS & GRADES */}
      {activeTab === 'submissions' && (
        <div>
          {/* Action header with Export CSV button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>
              Danh sách bài nộp & Kết quả chấm
            </h3>

            <a
              href={`/api/classrooms/${classroomId}/grades/csv${filterAssignmentId ? '?assignmentId=' + filterAssignmentId : ''}`}
              download={`grades_${classroomId}.csv`}
              className="btn btn-primary"
              data-testid="export-csv-btn"
            >
              📥 Xuất bảng điểm (CSV)
            </a>
          </div>

          {/* Filter Bar */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
              }}
            >
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Bài tập
                </label>
                <select
                  className="form-control"
                  style={{ fontSize: '0.8rem' }}
                  value={filterAssignmentId}
                  onChange={(e) => setFilterAssignmentId(e.target.value)}
                  data-testid="filter-assignment-select"
                >
                  <option value="">Tất cả bài tập</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Trạng thái
                </label>
                <select
                  className="form-control"
                  style={{ fontSize: '0.8rem' }}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  data-testid="filter-status-select"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="COMPLETED">Hoàn thành (COMPLETED)</option>
                  <option value="PENDING">Đang chờ (PENDING)</option>
                  <option value="RUNNING">Đang chấm (RUNNING)</option>
                  <option value="SYSTEM_ERROR">Lỗi hệ thống (SYSTEM_ERROR)</option>
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Điểm từ
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  placeholder="0.0"
                  className="form-control"
                  style={{ fontSize: '0.8rem' }}
                  value={filterMinScore}
                  onChange={(e) => setFilterMinScore(e.target.value)}
                  data-testid="filter-min-score"
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Điểm đến
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  placeholder="1.0"
                  className="form-control"
                  style={{ fontSize: '0.8rem' }}
                  value={filterMaxScore}
                  onChange={(e) => setFilterMaxScore(e.target.value)}
                  data-testid="filter-max-score"
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Từ thời điểm
                </label>
                <input
                  type="datetime-local"
                  className="form-control"
                  style={{ fontSize: '0.8rem' }}
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  Đến thời điểm
                </label>
                <input
                  type="datetime-local"
                  className="form-control"
                  style={{ fontSize: '0.8rem' }}
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: '1rem',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  setFilterAssignmentId('');
                  setFilterStatus('');
                  setFilterMinScore('');
                  setFilterMaxScore('');
                  setFilterFrom('');
                  setFilterTo('');
                  try {
                    const res = await fetch(`/api/classrooms/${classroomId}/submissions`);
                    if (res.ok) {
                      const data = await res.json();
                      setSubmissions(data.submissions || []);
                    }
                  } catch {
                    // non-fatal
                  }
                }}
              >
                Đặt lại bộ lọc
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={fetchSubmissions}
                data-testid="apply-filter-btn"
              >
                Áp dụng bộ lọc
              </button>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="card">
            {submissions.length === 0 ? (
              <p style={{ color: 'var(--neutral-600)', padding: '1rem 0' }}>
                Không tìm thấy bài nộp nào phù hợp với bộ lọc.
              </p>
            ) : (
              <table className="table" data-testid="submissions-table">
                <thead>
                  <tr>
                    <th>Sinh viên</th>
                    <th>Bài tập</th>
                    <th>Trạng thái</th>
                    <th>Điểm</th>
                    <th>Test đạt</th>
                    <th>Hạn nộp</th>
                    <th>Thời gian nộp</th>
                    <th style={{ textAlign: 'right' }}>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr key={sub.id} data-testid={`submission-row-${sub.id}`}>
                      <td>
                        <strong>{sub.studentCode || 'N/A'}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--neutral-600)' }}>
                          {sub.studentName}
                        </div>
                      </td>
                      <td>{sub.assignmentTitle}</td>
                      <td>
                        <span
                          className={`badge ${
                            sub.status === 'COMPLETED'
                              ? 'badge-completed'
                              : sub.status === 'SYSTEM_ERROR'
                                ? 'badge-wa'
                                : 'badge-pending'
                          }`}
                          data-testid={`sub-status-${sub.id}`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td>
                        <strong
                          style={{
                            color:
                              sub.score !== null && sub.score >= 0.8
                                ? 'var(--success)'
                                : sub.score !== null && sub.score > 0
                                  ? 'var(--warning)'
                                  : 'var(--neutral-700)',
                          }}
                          data-testid={`sub-score-${sub.id}`}
                        >
                          {sub.score !== null ? Number(sub.score).toFixed(2) : '—'}
                        </strong>
                      </td>
                      <td>
                        {sub.passedTests} / {sub.totalTests}
                      </td>
                      <td>
                        {sub.isLate ? (
                          <span className="badge badge-wa">Nộp trễ</span>
                        ) : (
                          <span className="badge badge-ac">Đúng hạn</span>
                        )}
                      </td>
                      <td>{new Date(sub.createdAt).toLocaleString('vi-VN')}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleViewSubmissionDetail(sub.id)}
                          data-testid={`view-submission-btn-${sub.id}`}
                        >
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Submission Detail Modal */}
      {selectedSubDetail && (
        <div className="modal-backdrop" onClick={() => setSelectedSubDetail(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            data-testid="submission-detail-modal"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ color: 'var(--primary)' }}>
                Chi tiết bài nộp #{selectedSubDetail.id.slice(0, 8)}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Link
                  href={`/lecturer/submissions/${selectedSubDetail.id}`}
                  className="btn btn-secondary btn-sm"
                  data-testid="open-submission-page-link"
                >
                  Sửa điểm & Chấm lại →
                </Link>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedSubDetail(null)}
                >
                  ✕ Đóng
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
              <div>
                <strong>Trạng thái:</strong> {selectedSubDetail.status}
              </div>
              <div>
                <strong>Điểm số:</strong>{' '}
                <span data-testid="detail-score">
                  {selectedSubDetail.score !== null
                    ? Number(selectedSubDetail.score).toFixed(2)
                    : '—'}
                </span>
              </div>
              <div>
                <strong>Test đạt:</strong> {selectedSubDetail.passedTests} /{' '}
                {selectedSubDetail.totalTests}
              </div>
              <div>
                <strong>Hạn:</strong> {selectedSubDetail.isLate ? 'Nộp trễ' : 'Đúng hạn'}
              </div>
            </div>

            {selectedSubDetail.compileOutput && (
              <div style={{ marginBottom: '1rem' }}>
                <h4
                  style={{ fontSize: '0.95rem', color: 'var(--danger)', marginBottom: '0.25rem' }}
                >
                  Thông báo lỗi biên dịch (Compile Output):
                </h4>
                <pre className="code-box" data-testid="detail-compile-output">
                  {selectedSubDetail.compileOutput}
                </pre>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <h4
                style={{
                  fontSize: '0.95rem',
                  color: 'var(--neutral-700)',
                  marginBottom: '0.25rem',
                }}
              >
                Mã nguồn sinh viên đã nộp:
              </h4>
              <pre className="code-box" data-testid="detail-submitted-code">
                {selectedSubDetail.submittedCode}
              </pre>
            </div>

            <div>
              <h4
                style={{ fontSize: '0.95rem', color: 'var(--neutral-700)', marginBottom: '0.5rem' }}
              >
                Bảng kết quả chi tiết từng Test Case:
              </h4>
              <table className="table" data-testid="detail-tests-table">
                <thead>
                  <tr>
                    <th>Test #</th>
                    <th>Verdict</th>
                    <th>Thời gian</th>
                    <th>Bộ nhớ</th>
                    <th>Trích đoạn Output</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSubDetail.tests.map((t, idx) => (
                    <tr key={t.testCaseId || idx} data-testid={`detail-test-row-${idx}`}>
                      <td>
                        <strong>Test {t.orderIndex !== undefined ? t.orderIndex : idx + 1}</strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            t.verdict === 'AC'
                              ? 'badge-ac'
                              : t.verdict === 'WA'
                                ? 'badge-wa'
                                : t.verdict === 'TLE'
                                  ? 'badge-tle'
                                  : 'badge-ce'
                          }`}
                          data-testid={`verdict-${idx}`}
                        >
                          {t.verdict}
                        </span>
                      </td>
                      <td>{t.executionTimeMs} ms</td>
                      <td>{t.memoryUsedKb} KB</td>
                      <td>
                        <small style={{ color: 'var(--neutral-600)' }}>
                          {t.studentOutputExcerpt || '—'}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedSubDetail(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
