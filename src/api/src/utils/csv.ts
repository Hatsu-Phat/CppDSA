export interface CsvStudentRow {
  studentCode: string;
  fullName: string;
  email: string;
  row: number;
}

export interface CsvRowError {
  row: number;
  error: string;
}

export interface ParseStudentCsvResult {
  validRows: CsvStudentRow[];
  errors: CsvRowError[];
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseStudentCsv(content: string, maxRows = 500): ParseStudentCsvResult {
  const rawLines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmptyLines: { line: string; originalIndex: number }[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed.length > 0) {
      nonEmptyLines.push({ line: trimmed, originalIndex: i + 1 });
    }
  }

  if (nonEmptyLines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header
  const headerCols = parseCsvLine(nonEmptyLines[0].line).map((c) =>
    c.toLowerCase().replace(/[\s_-]/g, '')
  );

  const studentCodeIdx = headerCols.findIndex((c) => c === 'studentcode' || c === 'mssv');
  const fullNameIdx = headerCols.findIndex(
    (c) => c === 'fullname' || c === 'hoten' || c === 'name'
  );
  const emailIdx = headerCols.findIndex((c) => c === 'email');

  if (studentCodeIdx === -1 || fullNameIdx === -1 || emailIdx === -1) {
    throw new Error('Invalid CSV header: required columns are student_code, full_name, email');
  }

  const dataLines = nonEmptyLines.slice(1);
  if (dataLines.length > maxRows) {
    const err = new Error(
      `CSV file contains ${dataLines.length} rows, exceeding limit of ${maxRows}`
    );
    (err as unknown as { code: string }).code = 'CSV_TOO_MANY_ROWS';
    throw err;
  }

  const validRows: CsvStudentRow[] = [];
  const errors: CsvRowError[] = [];
  const seenCodes = new Set<string>();

  for (const { line, originalIndex } of dataLines) {
    const cols = parseCsvLine(line);
    const studentCode = cols[studentCodeIdx] || '';
    const fullName = cols[fullNameIdx] || '';
    const email = cols[emailIdx] || '';

    if (!studentCode || !fullName || !email) {
      errors.push({
        row: originalIndex,
        error: 'Missing required field(s)',
      });
      continue;
    }

    if (!EMAIL_REGEX.test(email)) {
      errors.push({
        row: originalIndex,
        error: `Invalid email format: ${email}`,
      });
      continue;
    }

    if (seenCodes.has(studentCode)) {
      errors.push({
        row: originalIndex,
        error: `Duplicate student code in CSV: ${studentCode}`,
      });
      continue;
    }

    seenCodes.add(studentCode);
    validRows.push({
      studentCode,
      fullName,
      email,
      row: originalIndex,
    });
  }

  return { validRows, errors };
}

export function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface GradeExportRow {
  studentCode: string;
  fullName: string;
  email: string;
  assignmentTitle?: string;
  score: number | string | null;
  isLate: boolean;
}

export function generateGradesCsv(rows: GradeExportRow[]): string {
  const header = ['student_code', 'full_name', 'email', 'assignment_title', 'score', 'is_late'];
  const lines: string[] = [header.join(',')];

  for (const row of rows) {
    const line = [
      escapeCsvField(row.studentCode),
      escapeCsvField(row.fullName),
      escapeCsvField(row.email),
      escapeCsvField(row.assignmentTitle || ''),
      escapeCsvField(row.score ?? ''),
      escapeCsvField(row.isLate ? 'true' : 'false'),
    ].join(',');
    lines.push(line);
  }

  return lines.join('\n');
}
