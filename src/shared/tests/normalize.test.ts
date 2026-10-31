import { describe, it, expect } from 'vitest';
import { normalizeOutput } from '../src/index';

describe('normalizeOutput (REQUIREMENTS §4.4)', () => {
  it('normalizes CRLF to LF', () => {
    expect(normalizeOutput('line 1\r\nline 2\r\n')).toBe('line 1\nline 2');
  });

  it('trims trailing spaces on each line', () => {
    expect(normalizeOutput('hello   \nworld\t  ')).toBe('hello\nworld');
  });

  it('removes trailing empty lines at the end of output', () => {
    expect(normalizeOutput('answer\n\n\n')).toBe('answer');
  });

  it('preserves indentation and spaces between words', () => {
    expect(normalizeOutput('  leading and   middle   ')).toBe('  leading and   middle');
  });

  it('preserves character casing', () => {
    expect(normalizeOutput('Hello World')).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(normalizeOutput('')).toBe('');
  });
});
