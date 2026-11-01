import { describe, it, expect } from 'vitest';
import { validateTemplateMarkers } from '../src/utils/template';
import { parseStudentCsv, generateGradesCsv } from '../src/utils/csv';
import { hashPassword, comparePassword, safeCompare } from '../src/utils/security';

describe('Unit Tests: Template Marker Validation (AC-US-02-2)', () => {
  it('accepts valid template with one or more regions', () => {
    const code = `
      #include <iostream>
      // STUDENT_BEGIN solve
      void solve() {}
      // STUDENT_END
      int main() { solve(); }
    `;
    const res = validateTemplateMarkers(code);
    expect(res.valid).toBe(true);
    expect(res.regions).toEqual(['solve']);
  });

  it('accepts valid template with multiple distinct regions', () => {
    const code = `
      // STUDENT_BEGIN part1
      int a = 1;
      // STUDENT_END
      // STUDENT_BEGIN part2
      int b = 2;
      // STUDENT_END
    `;
    const res = validateTemplateMarkers(code);
    expect(res.valid).toBe(true);
    expect(res.regions).toEqual(['part1', 'part2']);
  });

  it('rejects template without any markers', () => {
    const code = 'int main() { return 0; }';
    const res = validateTemplateMarkers(code);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('at least one');
  });

  it('rejects template with missing STUDENT_END marker', () => {
    const code = `
      // STUDENT_BEGIN incomplete
      void test() {}
    `;
    const res = validateTemplateMarkers(code);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Unclosed STUDENT_BEGIN marker');
  });

  it('rejects template with unexpected STUDENT_END marker without BEGIN', () => {
    const code = `
      void test() {}
      // STUDENT_END
    `;
    const res = validateTemplateMarkers(code);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Unexpected STUDENT_END marker');
  });

  it('rejects template with nested STUDENT_BEGIN markers', () => {
    const code = `
      // STUDENT_BEGIN outer
      // STUDENT_BEGIN inner
      int x = 10;
      // STUDENT_END
      // STUDENT_END
    `;
    const res = validateTemplateMarkers(code);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Nested STUDENT_BEGIN marker');
  });

  it('rejects template with duplicate region names', () => {
    const code = `
      // STUDENT_BEGIN dup
      int a;
      // STUDENT_END
      // STUDENT_BEGIN dup
      int b;
      // STUDENT_END
    `;
    const res = validateTemplateMarkers(code);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Duplicate region names');
  });
});

describe('Unit Tests: Student CSV Parsing (US-01, AC-US-01-2)', () => {
  it('parses valid CSV lines correctly', () => {
    const csv = `student_code,full_name,email
SV001,Nguyen Van A,nva@example.com
SV002,Tran Thi B,ttb@example.com`;

    const res = parseStudentCsv(csv, 500);
    expect(res.validRows).toHaveLength(2);
    expect(res.errors).toHaveLength(0);
    expect(res.validRows[0].studentCode).toBe('SV001');
    expect(res.validRows[0].fullName).toBe('Nguyen Van A');
    expect(res.validRows[0].email).toBe('nva@example.com');
  });

  it('handles quotes with commas inside fields', () => {
    const csv = `student_code,full_name,email
SV003,"Le, Hoang C",lhc@example.com`;

    const res = parseStudentCsv(csv, 500);
    expect(res.validRows).toHaveLength(1);
    expect(res.validRows[0].fullName).toBe('Le, Hoang C');
  });

  it('reports errors per row without dropping valid rows (AC-US-01-2)', () => {
    const csv = `student_code,full_name,email
SV001,Nguyen Van A,nva@example.com
SV002,,ttb@example.com
SV003,Le Hoang C,invalid-email
SV001,Duplicate Code,dup@example.com
SV004,Pham Van D,pvd@example.com`;

    const res = parseStudentCsv(csv, 500);
    expect(res.validRows).toHaveLength(2); // SV001 and SV004
    expect(res.errors).toHaveLength(3);
    expect(res.errors.some((e) => e.error.includes('Missing required field'))).toBe(true);
    expect(res.errors.some((e) => e.error.includes('Invalid email format'))).toBe(true);
    expect(res.errors.some((e) => e.error.includes('Duplicate student code'))).toBe(true);
  });

  it('enforces 500 rows limit boundary: 500 lines accepted, 501 rejected with CSV_TOO_MANY_ROWS', () => {
    // 500 rows
    const header = 'student_code,full_name,email\n';
    let lines500 = header;
    for (let i = 1; i <= 500; i++) {
      lines500 += `SV${String(i).padStart(4, '0')},Student ${i},s${i}@example.com\n`;
    }
    const res500 = parseStudentCsv(lines500, 500);
    expect(res500.validRows).toHaveLength(500);

    // 501 rows
    const lines501 = lines500 + 'SV0501,Student 501,s501@example.com\n';
    expect(() => parseStudentCsv(lines501, 500)).toThrowError(/exceeding limit of 500/);
    try {
      parseStudentCsv(lines501, 500);
    } catch (err: any) {
      expect(err.code).toBe('CSV_TOO_MANY_ROWS');
    }
  });
});

describe('Unit Tests: Grades CSV Generation (US-06)', () => {
  it('formats grade report into proper CSV with escaping', () => {
    const rows = [
      {
        studentCode: 'SV001',
        fullName: 'Nguyen, Van A',
        email: 'nva@example.com',
        assignmentTitle: 'Bai tap 1',
        score: 1.0,
        isLate: false,
      },
      {
        studentCode: 'SV002',
        fullName: 'Tran Thi B',
        email: 'ttb@example.com',
        assignmentTitle: 'Bai tap 1',
        score: 0.75,
        isLate: true,
      },
    ];

    const csv = generateGradesCsv(rows);
    expect(csv).toContain('student_code,full_name,email,assignment_title,score,is_late');
    expect(csv).toContain('"Nguyen, Van A"');
    expect(csv).toContain('false');
    expect(csv).toContain('true');
  });
});

describe('Unit Tests: Security & Passwords', () => {
  it('hashes passwords and verifies correctly', async () => {
    const password = 'StrongPassword123!';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true);

    const match = await comparePassword(password, hash);
    expect(match).toBe(true);

    const wrong = await comparePassword('WrongPassword', hash);
    expect(wrong).toBe(false);
  });

  it('performs constant-time safe comparison of secrets', () => {
    expect(safeCompare('secret-key-123', 'secret-key-123')).toBe(true);
    expect(safeCompare('secret-key-123', 'secret-key-456')).toBe(false);
    expect(safeCompare('secret-key-123', 'short')).toBe(false);
    expect(safeCompare('', 'secret')).toBe(false);
  });
});
