exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. classroom_enrollments
  pgm.createTable('classroom_enrollments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    classroom_id: {
      type: 'uuid',
      notNull: true,
      references: 'classrooms(id)',
      onDelete: 'CASCADE',
    },
    student_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    student_code: {
      type: 'varchar(50)',
      notNull: true,
    },
    enrolled_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint('classroom_enrollments', 'unique_classroom_student', {
    unique: ['classroom_id', 'student_id'],
  });

  // 2. test_cases
  pgm.createTable('test_cases', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    assignment_id: {
      type: 'uuid',
      notNull: true,
      references: 'assignments(id)',
      onDelete: 'CASCADE',
    },
    order_index: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    input_data: {
      type: 'text',
      notNull: true,
    },
    expected_output: {
      type: 'text',
      notNull: true,
    },
    is_hidden: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    is_sample: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // 3. submissions
  pgm.createTable('submissions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    assignment_id: {
      type: 'uuid',
      notNull: true,
      references: 'assignments(id)',
      onDelete: 'CASCADE',
    },
    student_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    submitted_code: {
      type: 'text',
      notNull: true,
    },
    entry_point_declaration: {
      type: 'jsonb',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'PENDING',
    },
    score: {
      type: 'numeric(5, 2)',
      notNull: true,
      default: 0.0,
    },
    total_tests: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    passed_tests: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    is_late: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    retry_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    compile_output: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    finished_at: {
      type: 'timestamptz',
    },
  });

  // 4. submission_test_results
  pgm.createTable('submission_test_results', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    submission_id: {
      type: 'uuid',
      notNull: true,
      references: 'submissions(id)',
      onDelete: 'CASCADE',
    },
    test_case_id: {
      type: 'uuid',
      notNull: true,
      references: 'test_cases(id)',
      onDelete: 'CASCADE',
    },
    verdict: {
      type: 'varchar(10)',
      notNull: true,
    },
    execution_time_ms: {
      type: 'integer',
    },
    memory_used_kb: {
      type: 'integer',
    },
    student_output_excerpt: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint('submission_test_results', 'unique_submission_test_case', {
    unique: ['submission_id', 'test_case_id'],
  });

  // 5. sessions
  pgm.createTable('sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    token_hash: {
      type: 'varchar(64)',
      notNull: true,
      unique: true,
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // 6. Indexes
  pgm.createIndex('classrooms', 'lecturer_id', { name: 'idx_classrooms_lecturer' });
  pgm.createIndex('classroom_enrollments', 'student_id', { name: 'idx_enrollments_student' });
  pgm.createIndex('classroom_enrollments', 'classroom_id', { name: 'idx_enrollments_classroom' });
  pgm.createIndex('classroom_enrollments', ['classroom_id', 'student_code'], {
    name: 'idx_enrollments_student_code',
  });
  pgm.createIndex('assignments', 'classroom_id', { name: 'idx_assignments_classroom' });
  pgm.createIndex('test_cases', ['assignment_id', 'order_index'], {
    name: 'idx_testcases_assignment',
  });
  pgm.createIndex(
    'submissions',
    ['assignment_id', 'student_id', { name: 'created_at', sort: 'DESC' }],
    {
      name: 'idx_submissions_assignment_student',
    }
  );
  pgm.createIndex('submissions', 'status', {
    name: 'idx_submissions_status',
    where: "status IN ('PENDING', 'RUNNING')",
  });
  pgm.createIndex('submission_test_results', 'submission_id', {
    name: 'idx_sub_results_submission',
  });
  pgm.createIndex('sessions', 'token_hash', { name: 'idx_sessions_token_hash' });
  pgm.createIndex('sessions', 'user_id', { name: 'idx_sessions_user_id' });
  pgm.createIndex('sessions', 'expires_at', { name: 'idx_sessions_expires_at' });
};

exports.down = (pgm) => {
  pgm.dropTable('sessions');
  pgm.dropTable('submission_test_results');
  pgm.dropTable('submissions');
  pgm.dropTable('test_cases');
  pgm.dropTable('classroom_enrollments');
};
