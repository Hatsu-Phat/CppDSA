import { describe, it, expect } from 'vitest';
import { extractTemplateRegions, validateTemplateRegions, stitchTemplate } from '../src/index';

describe('Template Mode Validation & Stitching', () => {
  const sampleTemplate = `
#include <iostream>

// STUDENT_BEGIN addFunction
int add(int a, int b);
// STUDENT_END

// STUDENT_BEGIN multiplyFunction
int multiply(int a, int b);
// STUDENT_END

int main() {
    std::cout << add(2, 3) << " " << multiply(2, 3) << std::endl;
    return 0;
}
`;

  it('extracts all region names in order', () => {
    const regions = extractTemplateRegions(sampleTemplate);
    expect(regions).toEqual(['addFunction', 'multiplyFunction']);
  });

  it('validates matching regions successfully', () => {
    const res = validateTemplateRegions(sampleTemplate, {
      addFunction: 'int add(int a, int b) { return a + b; }',
      multiplyFunction: 'int multiply(int a, int b) { return a * b; }',
    });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('fails validation when a declared region is missing', () => {
    const res = validateTemplateRegions(sampleTemplate, {
      addFunction: 'int add(int a, int b) { return a + b; }',
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Missing region in submission: multiplyFunction');
  });

  it('fails validation when an extra undeclared region is provided', () => {
    const res = validateTemplateRegions(sampleTemplate, {
      addFunction: 'int add(int a, int b) { return a + b; }',
      multiplyFunction: 'int multiply(int a, int b) { return a * b; }',
      hackRegion: 'int secret = 1;',
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Unexpected extra region in submission: hackRegion');
  });

  it('stitches code into regions correctly', () => {
    const res = stitchTemplate(sampleTemplate, {
      addFunction: 'int add(int a, int b) { return a + b; }',
      multiplyFunction: 'int multiply(int a, int b) { return a * b; }',
    });
    expect(res.success).toBe(true);
    expect(res.code).toContain('int add(int a, int b) { return a + b; }');
    expect(res.code).toContain('int multiply(int a, int b) { return a * b; }');
    expect(res.code).toContain('int main()');
  });
});
