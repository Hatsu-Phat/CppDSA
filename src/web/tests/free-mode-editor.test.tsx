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

  it('renders default template with bits/stdc++.h when initialSource is omitted', () => {
    const handleSubmit = vi.fn();
    render(<FreeModeEditor onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId('free-source-input') as HTMLTextAreaElement;
    expect(textarea.value).toContain('#include <bits/stdc++.h>');
    expect(textarea.value).toContain('using namespace std;');
    expect(textarea.value).toContain('int main()');
  });

  it('rejects source code exceeding 64 KB limit', () => {
    const handleSubmit = vi.fn();
    const largeSource = 'a'.repeat(65537);
    render(<FreeModeEditor initialSource={largeSource} onSubmit={handleSubmit} />);

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorAlert = screen.getByTestId('free-mode-editor-error');
    expect(errorAlert.textContent).toContain('vượt quá dung lượng tối đa 64 KB');
  });

  it('disables submit button and shows loading text when submitting', () => {
    const handleSubmit = vi.fn();
    render(
      <FreeModeEditor initialSource="int main() {}" onSubmit={handleSubmit} submitting={true} />
    );

    const submitBtn = screen.getByTestId('submit-solution-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toContain('Đang gửi...');
  });

  it('updates source code when user types into textarea', () => {
    const handleSubmit = vi.fn();
    render(<FreeModeEditor initialSource="" onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId('free-source-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'int x = 42;' } });
    expect(textarea.value).toBe('int x = 42;');
  });
});
