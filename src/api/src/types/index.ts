export type UserRole = 'LECTURER' | 'STUDENT';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  must_change_password: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface ClassroomRow {
  id: string;
  name: string;
  description: string | null;
  lecturer_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface AssignmentRow {
  id: string;
  classroom_id: string;
  title: string;
  description: string | null;
  mode: 'TEMPLATE' | 'FREE';
  time_limit_ms: number;
  memory_limit_mb: number;
  deadline: Date;
  template_code: string | null;
  entry_point_spec: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface TestCaseRow {
  id: string;
  assignment_id: string;
  order_index: number;
  input_data: string;
  expected_output: string;
  is_hidden: boolean;
  is_sample: boolean;
  created_at: Date;
}

export interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_code: string;
  entry_point_declaration: unknown;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SYSTEM_ERROR';
  score: string | number;
  total_tests: number;
  passed_tests: number;
  is_late: boolean;
  retry_count: number;
  compile_output: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

export interface SubmissionTestResultRow {
  id: string;
  submission_id: string;
  test_case_id: string;
  verdict: string;
  execution_time_ms: number | null;
  memory_used_kb: number | null;
  student_output_excerpt: string | null;
  created_at: Date;
}
