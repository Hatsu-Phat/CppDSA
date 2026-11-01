import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CsvImportForm from '../components/CsvImportForm';

describe('CsvImportForm Component', () => {
  it('renders CSV file input and textarea', () => {
    render(<CsvImportForm classroomId="class-123" />);

    expect(screen.getByTestId('csv-file-input')).toBeDefined();
    expect(screen.getByTestId('csv-textarea')).toBeDefined();
    expect(screen.getByTestId('import-csv-submit')).toBeDefined();
  });

  it('rejects empty CSV submission with an error alert', async () => {
    render(<CsvImportForm classroomId="class-123" />);

    fireEvent.click(screen.getByTestId('import-csv-submit'));

    const error = await screen.findByTestId('csv-general-error');
    expect(error.textContent).toContain('Vui lòng nhập hoặc chọn file CSV');
  });

  it('displays per-row errors and temporary passwords table on successful API response', async () => {
    const mockResponse = {
      successCount: 2,
      errorCount: 1,
      errors: [{ row: 4, error: 'Email không hợp lệ: invalid_email' }],
      students: [
        {
          studentCode: '2026001',
          email: 's1@example.com',
          status: 'created',
          temporaryPassword: 'Temp@111111',
        },
        {
          studentCode: '2026002',
          email: 's2@example.com',
          status: 'created',
          temporaryPassword: 'Temp@222222',
        },
      ],
      createdStudents: [
        { studentCode: '2026001', email: 's1@example.com', temporaryPassword: 'Temp@111111' },
        { studentCode: '2026002', email: 's2@example.com', temporaryPassword: 'Temp@222222' },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any);

    const onImportSuccess = vi.fn();
    render(<CsvImportForm classroomId="class-123" onImportSuccess={onImportSuccess} />);

    const sampleCsv = `student_code,full_name,email\n2026001,Nguyen Van A,s1@example.com\n2026002,Tran Thi B,s2@example.com\n2026003,Le Van C,invalid_email`;
    fireEvent.change(screen.getByTestId('csv-textarea'), { target: { value: sampleCsv } });
    fireEvent.click(screen.getByTestId('import-csv-submit'));

    // Check success count alert
    const successAlert = await screen.findByTestId('csv-success-alert');
    expect(successAlert.textContent).toContain('2 sinh viên');

    // Check error count alert and per-row error
    const errorsAlert = await screen.findByTestId('csv-errors-alert');
    expect(errorsAlert.textContent).toContain('1 dòng dữ liệu bị lỗi');

    const errorItem = await screen.findByTestId('csv-error-item');
    expect(errorItem.textContent).toContain('Dòng 4');
    expect(errorItem.textContent).toContain('Email không hợp lệ');

    // Check temporary passwords table
    const passTable = await screen.findByTestId('created-passwords-table');
    expect(passTable).toBeDefined();

    expect(screen.getByTestId('temp-password-2026001').textContent).toBe('Temp@111111');
    expect(screen.getByTestId('temp-password-2026002').textContent).toBe('Temp@222222');

    expect(onImportSuccess).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('displays API error alert when API returns 400', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'CSV_TOO_MANY_ROWS',
        message: 'File CSV vượt quá giới hạn tối đa 500 dòng',
      }),
    } as any);

    render(<CsvImportForm classroomId="class-123" />);

    fireEvent.change(screen.getByTestId('csv-textarea'), { target: { value: 'some csv' } });
    fireEvent.click(screen.getByTestId('import-csv-submit'));

    const errorAlert = await screen.findByTestId('csv-general-error');
    expect(errorAlert.textContent).toContain('File CSV vượt quá giới hạn tối đa 500 dòng');

    vi.restoreAllMocks();
  });
});
