import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function getAllFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        files.push(...getAllFiles(fullPath));
      }
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Security Leak Scanner (Backend Credentials & Secret Isolation)', () => {
  it('verifies src/web contains no DATABASE_URL, GRADER_SECRET, or postgres:// strings', () => {
    const webDir = path.resolve(__dirname, '../../web');
    const files = getAllFiles(webDir);

    expect(files.length).toBeGreaterThan(0);

    const forbiddenPatterns = ['DATABASE_URL', 'GRADER_SECRET', 'postgres://'];

    const violations: { file: string; pattern: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        if (content.includes(pattern)) {
          violations.push({ file: path.relative(webDir, file), pattern });
        }
      }
    }

    expect(
      violations,
      `Found forbidden credentials/secrets in frontend code:\n${violations
        .map((v) => `  ${v.file}: contains '${v.pattern}'`)
        .join('\n')}`
    ).toHaveLength(0);
  });
});
