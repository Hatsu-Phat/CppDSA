/**
 * Normalizes output string according to REQUIREMENTS §4.4:
 * 1. Normalize line endings (\r\n -> \n, \r -> \n)
 * 2. Trim trailing whitespace on each line (line.trimEnd())
 * 3. Remove trailing empty lines at end of output
 * 4. Preserves spaces between words and character casing
 */
export function normalizeOutput(output: string): string {
  if (!output) {
    return '';
  }

  // 1. Normalize line endings
  const lines = output.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // 2. Trim trailing whitespace on each line
  const trimmedLines = lines.map((line) => line.trimEnd());

  // 3. Remove trailing empty lines at end of output
  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1] === '') {
    trimmedLines.pop();
  }

  return trimmedLines.join('\n');
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  db?: 'ok' | 'error';
  timestamp?: string;
}
