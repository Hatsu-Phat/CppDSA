import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FreeModeEditor from '../components/FreeModeEditor';

describe('FreeModeEditor Component', () => {
  it('validates and rejects empty source code', () => {
    const handleSubmit = vi.fn();
    render(<FreeModeEditor onSubmit={handleSubmit} />);

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorAlert = screen.getByTestId('free-mode-editor-error');
    expect(errorAlert.textContent).toContain('Mã nguồn sinh viên không được để trống');
  });

  it('validates and rejects empty or invalid entry point name', () => {
    const handleSubmit = vi.fn();
    render(
      <FreeModeEditor
        initialSource="int solve() { return 42; }"
        initialEntry={{ type: 'function', name: '' }}
        onSubmit={handleSubmit}
      />
    );

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorAlert = screen.getByTestId('free-mode-editor-error');
    expect(errorAlert.textContent).toContain('Thiếu tên điểm vào');
  });

  it('validates and rejects invalid C++ keyword as entry point name', () => {
    const handleSubmit = vi.fn();
    render(
      <FreeModeEditor
        initialSource="int solve() { return 42; }"
        initialEntry={{ type: 'function', name: 'class' }}
        onSubmit={handleSubmit}
      />
    );

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorAlert = screen.getByTestId('free-mode-editor-error');
    expect(errorAlert.textContent).toContain(
      'không phải là định danh C++ hợp lệ hoặc trùng từ khóa'
    );
  });

  it('validates and rejects method type when className is missing', () => {
    const handleSubmit = vi.fn();
    render(
      <FreeModeEditor
        initialSource="class Solution { public: int solve() { return 42; } };"
        initialEntry={{ type: 'method', name: 'solve', className: '' }}
        onSubmit={handleSubmit}
      />
    );

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorAlert = screen.getByTestId('free-mode-editor-error');
    expect(errorAlert.textContent).toContain('Phương thức (method) yêu cầu khai báo tên lớp');
  });

  it('submits valid payload matching openapi.yaml schema for function entry', () => {
    const handleSubmit = vi.fn();
    render(
      <FreeModeEditor
        initialSource="int timChiSoTong() { return 1; }"
        initialEntry={{ type: 'function', name: 'timChiSoTong' }}
        onSubmit={handleSubmit}
      />
    );

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const payload = handleSubmit.mock.calls[0][0];

    expect(payload).toEqual({
      studentSource: 'int timChiSoTong() { return 1; }',
      entry: {
        type: 'function',
        name: 'timChiSoTong',
      },
    });
  });

  it('submits valid payload matching openapi.yaml schema for method entry with className', () => {
    const handleSubmit = vi.fn();
    render(
      <FreeModeEditor
        initialSource="class Solution { public: int timTong() { return 1; } };"
        initialEntry={{ type: 'method', name: 'timTong', className: 'Solution' }}
        onSubmit={handleSubmit}
      />
    );

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const payload = handleSubmit.mock.calls[0][0];

    expect(payload).toEqual({
      studentSource: 'class Solution { public: int timTong() { return 1; } };',
      entry: {
        type: 'method',
        name: 'timTong',
        className: 'Solution',
      },
    });
  });
});
