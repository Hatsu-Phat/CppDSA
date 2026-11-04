import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssignmentForm from '../components/AssignmentForm';

describe('AssignmentForm Component', () => {
  it('renders initial TEMPLATE mode form fields with default values', () => {
    render(<AssignmentForm classroomId="class-123" />);

    expect(screen.getByLabelText(/Tiêu đề bài tập/i)).toBeDefined();
    expect(screen.getByLabelText(/Chế độ bài tập/i)).toBeDefined();
    const tlInput = screen.getByLabelText(/Giới hạn thời gian/i) as HTMLInputElement;
    expect(tlInput.value).toBe('1000');
    const mlInput = screen.getByLabelText(/Giới hạn bộ nhớ/i) as HTMLInputElement;
    expect(mlInput.value).toBe('256');
    expect(screen.getByTestId('template-mode-section')).toBeDefined();
  });

  it('switches to FREE mode and renders notice without harness field', () => {
    render(<AssignmentForm classroomId="class-123" />);

    const modeSelect = screen.getByTestId('assignment-mode-select');
    fireEvent.change(modeSelect, { target: { value: 'FREE' } });

    const freeSection = screen.getByTestId('free-mode-section');
    expect(freeSection).toBeDefined();
    expect(freeSection.textContent).toContain('Sinh viên nộp chương trình đầy đủ');
    expect(screen.queryByTestId('template-mode-section')).toBeNull();
  });

  it('validates and rejects empty title with clear error message', async () => {
    render(<AssignmentForm classroomId="class-123" />);

    const submitBtn = screen.getByTestId('submit-assignment-btn');
    fireEvent.click(submitBtn);

    const error = await screen.findByTestId('assignment-form-error');
    expect(error.textContent).toContain('Tiêu đề bài tập không được để trống');
  });

  it('validates and rejects negative time limit (TL) with clear error message', async () => {
    render(<AssignmentForm classroomId="class-123" />);

    fireEvent.change(screen.getByTestId('assignment-title-input'), {
      target: { value: 'Bài tập 1' },
    });
    fireEvent.change(screen.getByTestId('assignment-tl-input'), {
      target: { value: '-500' },
    });

    fireEvent.click(screen.getByTestId('submit-assignment-btn'));

    const error = await screen.findByTestId('assignment-form-error');
    expect(error.textContent).toContain('Thời gian chạy (TL) phải là số dương');
  });

  it('validates and rejects negative memory limit (ML) with clear error message', async () => {
    render(<AssignmentForm classroomId="class-123" />);

    fireEvent.change(screen.getByTestId('assignment-title-input'), {
      target: { value: 'Bài tập 1' },
    });
    fireEvent.change(screen.getByTestId('assignment-ml-input'), {
      target: { value: '0' },
    });

    fireEvent.click(screen.getByTestId('submit-assignment-btn'));

    const error = await screen.findByTestId('assignment-form-error');
    expect(error.textContent).toContain('Giới hạn bộ nhớ (ML) phải là số dương');
  });

  it('validates TEMPLATE mode and rejects code missing // STUDENT_END marker', async () => {
    render(<AssignmentForm classroomId="class-123" />);

    fireEvent.change(screen.getByTestId('assignment-title-input'), {
      target: { value: 'Bài tập Template' },
    });
    // Missing STUDENT_END
    fireEvent.change(screen.getByTestId('assignment-template-input'), {
      target: { value: '#include <iostream>\n// STUDENT_BEGIN solve\nint x = 1;\n' },
    });

    fireEvent.click(screen.getByTestId('submit-assignment-btn'));

    const error = await screen.findByTestId('assignment-form-error');
    expect(error.textContent).toContain('thiếu // STUDENT_END');
  });

  it('validates TEMPLATE mode and accepts valid matched markers', async () => {
    const onSubmitMock = vi.fn().mockResolvedValue({ id: 'assign-1' });
    render(<AssignmentForm classroomId="class-123" onSubmitCustom={onSubmitMock} />);

    fireEvent.change(screen.getByTestId('assignment-title-input'), {
      target: { value: 'Bài tập Template Hợp Lệ' },
    });
    fireEvent.change(screen.getByTestId('assignment-template-input'), {
      target: {
        value:
          '#include <iostream>\n// STUDENT_BEGIN solve\nvoid solve() {}\n// STUDENT_END\nint main(){}',
      },
    });

    fireEvent.click(screen.getByTestId('submit-assignment-btn'));

    await waitFor(() => {
      expect(onSubmitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Bài tập Template Hợp Lệ',
          mode: 'TEMPLATE',
          timeLimitMs: 1000,
          memoryLimitMb: 256,
        })
      );
    });
  });

  it('displays API error message clearly when server returns 400 or 413', async () => {
    // Mock global fetch
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: async () => ({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Mã template vượt quá dung lượng tối đa (65536 bytes)',
      }),
    } as any);

    render(<AssignmentForm classroomId="class-123" />);

    fireEvent.change(screen.getByTestId('assignment-title-input'), {
      target: { value: 'Bài tập Vượt Dung Lượng' },
    });
    fireEvent.change(screen.getByTestId('assignment-template-input'), {
      target: {
        value: '// STUDENT_BEGIN solve\n// STUDENT_END',
      },
    });

    fireEvent.click(screen.getByTestId('submit-assignment-btn'));

    const error = await screen.findByTestId('assignment-form-error');
    expect(error.textContent).toContain('Mã template vượt quá dung lượng tối đa');

    vi.restoreAllMocks();
  });

  it('renders statement PDF dropzone and handles valid PDF file selection and removal', () => {
    render(<AssignmentForm classroomId="class-123" />);

    expect(screen.getByTestId('statement-pdf-section')).toBeDefined();
    expect(screen.getByTestId('pdf-dropzone')).toBeDefined();

    const fileInput = screen.getByTestId('assignment-pdf-input');
    const pdfFile = new File(['%PDF-1.4 sample content'], 'problem.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    const fileInfo = screen.getByTestId('pdf-file-info');
    expect(fileInfo).toBeDefined();
    expect(fileInfo.textContent).toContain('problem.pdf');

    const removeBtn = screen.getByTestId('remove-pdf-btn');
    fireEvent.click(removeBtn);

    expect(screen.queryByTestId('pdf-file-info')).toBeNull();
    expect(screen.getByTestId('pdf-dropzone')).toBeDefined();
  });

  it('displays existing statement if provided in initialData', () => {
    render(
      <AssignmentForm
        classroomId="class-123"
        initialData={{
          statement: { name: 'existing_statement.pdf', size: 1048576 },
        }}
      />
    );

    const fileInfo = screen.getByTestId('pdf-file-info');
    expect(fileInfo.textContent).toContain('existing_statement.pdf');
    expect(fileInfo.textContent).toContain('1.00 MB');
    expect(screen.getByTestId('remove-pdf-btn')).toBeDefined();
  });

  it('rejects non-PDF files with clear error message', () => {
    render(<AssignmentForm classroomId="class-123" />);

    const fileInput = screen.getByTestId('assignment-pdf-input');
    const txtFile = new File(['text content'], 'problem.txt', {
      type: 'text/plain',
    });

    fireEvent.change(fileInput, { target: { files: [txtFile] } });

    const error = screen.getByTestId('assignment-form-error');
    expect(error.textContent).toContain('Chỉ chấp nhận file định dạng PDF');
  });
});
