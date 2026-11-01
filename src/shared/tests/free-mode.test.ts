import { describe, it, expect } from 'vitest';
import {
  isValidCppIdentifier,
  validateFreeModeSpec,
  generateFreeModeCode,
  FreeModeSpec,
} from '../src/index';

describe('Free Mode Validation & Code Generation', () => {
  it('identifies valid C++ identifiers', () => {
    expect(isValidCppIdentifier('myFunction')).toBe(true);
    expect(isValidCppIdentifier('_count')).toBe(true);
    expect(isValidCppIdentifier('Solution_123')).toBe(true);
  });

  it('rejects invalid C++ identifiers and keywords', () => {
    expect(isValidCppIdentifier('123bad')).toBe(false);
    expect(isValidCppIdentifier('my-func')).toBe(false);
    expect(isValidCppIdentifier('while')).toBe(false);
    expect(isValidCppIdentifier('class')).toBe(false);
    expect(isValidCppIdentifier('return')).toBe(false);
    expect(isValidCppIdentifier('int')).toBe(false);
  });

  it('generates code for function entry', () => {
    const spec: FreeModeSpec = {
      harness: 'int main() { return CPPDSA_ENTRY(1, 2); }',
      entry: { type: 'function', name: 'calculateSum' },
      studentSource: 'int calculateSum(int a, int b) { return a + b; }',
    };
    const res = generateFreeModeCode(spec);
    expect(res.success).toBe(true);
    expect(res.code).toContain('#define CPPDSA_ENTRY calculateSum');
    expect(res.code).toContain('int calculateSum(int a, int b)');
    expect(res.code).toContain('int main()');
  });

  it('generates code for method entry', () => {
    const spec: FreeModeSpec = {
      harness: 'int main() { return CPPDSA_ENTRY(1, 2); }',
      entry: { type: 'method', name: 'solve', className: 'MySolution' },
      studentSource: 'class MySolution { public: int solve(int a, int b) { return a + b; } };',
    };
    const res = generateFreeModeCode(spec);
    expect(res.success).toBe(true);
    expect(res.code).toContain('static MySolution o; return o.solve');
    expect(res.code).toContain('class MySolution');
  });

  it('rejects method entry without className', () => {
    const spec = {
      harness: 'int main() {}',
      entry: { type: 'method' as const, name: 'solve' },
      studentSource: '',
    };
    const res = validateFreeModeSpec(spec as any);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('className is required');
  });

  it('rejects keyword entry names', () => {
    const spec: FreeModeSpec = {
      harness: 'int main() {}',
      entry: { type: 'function', name: 'class' },
      studentSource: '',
    };
    const res = validateFreeModeSpec(spec);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('C++ keyword');
  });
});
