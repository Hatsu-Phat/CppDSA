import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FreeModeEditor from '../components/FreeModeEditor';

describe('FreeModeEditor Component', () => {
  it('validates and rejects empty source code', () => {
    const handleSubmit = vi.fn();
    render(<FreeModeEditor initialSource="" onSubmit={handleSubmit} />);

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorAlert = screen.getByTestId('free-mode-editor-error');
    expect(errorAlert.textContent).toContain('Mã nguồn sinh viên không được để trống');
  });

  it('submits valid payload with studentSource', () => {
    const handleSubmit = vi.fn();
    const source = '#include <iostream>\nint main() { return 0; }';
    render(<FreeModeEditor initialSource={source} onSubmit={handleSubmit} />);

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith({
      studentSource: source,
    });
  });

  it('inserts 4 spaces when Tab key is pressed', () => {
    const handleSubmit = vi.fn();
    render(<FreeModeEditor initialSource="int main() {}" onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId('free-source-input') as HTMLTextAreaElement;
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;

    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect(textarea.value.startsWith('    ')).toBe(true);
  });
});
