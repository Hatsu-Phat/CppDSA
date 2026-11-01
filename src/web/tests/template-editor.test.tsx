import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TemplateEditor, { parseTemplateSegments } from '../components/TemplateEditor';

const sampleTemplate = `#include <iostream>

struct ListNode {
    int val;
    ListNode* next;
};

// STUDENT_BEGIN reverseList
// Placeholder code
// STUDENT_END

int main() {
    return 0;
}
`;

describe('TemplateEditor Component', () => {
  it('correctly parses fixed and region segments from template code', () => {
    const segments = parseTemplateSegments(sampleTemplate);

    expect(segments.length).toBe(3);
    expect(segments[0].type).toBe('fixed');
    expect(segments[0].code).toContain('#include <iostream>');
    expect(segments[1].type).toBe('region');
    expect(segments[1].name).toBe('reverseList');
    expect(segments[1].code).toContain('Placeholder code');
    expect(segments[2].type).toBe('fixed');
    expect(segments[2].code).toContain('int main()');
  });

  it('renders fixed code in locked read-only blocks (pre/code) and not in inputs', () => {
    render(<TemplateEditor templateCode={sampleTemplate} onSubmit={vi.fn()} />);

    // Fixed code segments should be pre blocks, not inputs or textareas
    const fixedBlocks = screen.getAllByTestId('fixed-code-segment');
    expect(fixedBlocks.length).toBe(2);
    expect(fixedBlocks[0].tagName).toBe('PRE');
    expect(fixedBlocks[0].textContent).toContain('#include <iostream>');

    // There should only be ONE textarea for the region
    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBe(1);
    expect(textareas[0].getAttribute('data-testid')).toBe('region-input-reverseList');
  });

  it('submits payload containing ONLY the regions object and not the fixed template', () => {
    const handleSubmit = vi.fn();
    render(<TemplateEditor templateCode={sampleTemplate} onSubmit={handleSubmit} />);

    const regionTextarea = screen.getByTestId('region-input-reverseList');
    fireEvent.change(regionTextarea, {
      target: { value: 'ListNode* reverseList(ListNode* head) { return head; }' },
    });

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submittedPayload = handleSubmit.mock.calls[0][0];

    // Payload MUST only contain { regions: { ... } }
    expect(Object.keys(submittedPayload)).toEqual(['regions']);
    expect(submittedPayload.regions).toEqual({
      reverseList: 'ListNode* reverseList(ListNode* head) { return head; }',
    });
    // Ensure fixed parts like #include are not in payload
    expect(submittedPayload.templateCode).toBeUndefined();
    expect(submittedPayload.studentSource).toBeUndefined();
  });

  it('shows error when code exceeds 64 KB limit', () => {
    const handleSubmit = vi.fn();
    render(<TemplateEditor templateCode={sampleTemplate} onSubmit={handleSubmit} />);

    const hugeCode = 'x'.repeat(70000);
    const regionTextarea = screen.getByTestId('region-input-reverseList');
    fireEvent.change(regionTextarea, { target: { value: hugeCode } });

    const submitBtn = screen.getByTestId('submit-solution-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorAlert = screen.getByTestId('template-editor-error');
    expect(errorAlert.textContent).toContain('64 KB');
  });
});
