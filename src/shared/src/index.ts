/**
 * Shared types and utilities for CppDSA
 */

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
  queueLength?: number;
  activeJobs?: number;
}

// ==========================================
// Grader Job & Result Contracts (docs/GRADER.md)
// ==========================================

export type SubmissionMode = 'template' | 'free';

export type JudgeVerdict = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'SE';

export interface HiddenTest {
  id: string | number;
  input: string;
  expected: string;
}

export interface TemplateModeSpec {
  source: string;
  regions: Record<string, string>;
}

export interface FreeModeEntry {
  type: 'function' | 'method';
  name: string;
  className?: string;
}

export interface FreeModeSpec {
  harness?: string;
  entry?: FreeModeEntry;
  studentSource: string;
}

export interface JudgeJob {
  submissionId: string;
  mode: SubmissionMode;
  language: 'cpp17';
  timeLimitMs: number;
  memoryLimitMb: number;
  compare: 'trim-trailing';
  template?: TemplateModeSpec;
  free?: FreeModeSpec;
  hiddenTests: HiddenTest[];
  callbackUrl: string;
}

export interface TestResult {
  /** 0-based index corresponding to the index in JudgeJob.hiddenTests (0, 1, 2, ...) */
  index: number;
  verdict: JudgeVerdict;
  timeMs: number;
  memoryKb: number;
}

export interface JudgeResult {
  submissionId: string;
  status: 'DONE' | 'SYSTEM_ERROR';
  verdict: JudgeVerdict;
  score: number;
  tests: TestResult[];
  compileMessage?: string;
}

// ==========================================
// C++ Keywords & Identifiers Validation
// ==========================================

export const CPP_KEYWORDS: ReadonlySet<string> = new Set([
  'alignas',
  'alignof',
  'and',
  'and_eq',
  'asm',
  'auto',
  'bitand',
  'bitor',
  'bool',
  'break',
  'case',
  'catch',
  'char',
  'char8_t',
  'char16_t',
  'char32_t',
  'class',
  'compl',
  'concept',
  'const',
  'consteval',
  'constexpr',
  'constinit',
  'const_cast',
  'continue',
  'co_await',
  'co_return',
  'co_yield',
  'decltype',
  'default',
  'delete',
  'do',
  'double',
  'dynamic_cast',
  'else',
  'enum',
  'explicit',
  'export',
  'extern',
  'false',
  'float',
  'for',
  'friend',
  'goto',
  'if',
  'inline',
  'int',
  'long',
  'mutable',
  'namespace',
  'new',
  'noexcept',
  'not',
  'not_eq',
  'nullptr',
  'operator',
  'or',
  'or_eq',
  'private',
  'protected',
  'public',
  'reflexpr',
  'register',
  'reinterpret_cast',
  'requires',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'static_assert',
  'static_cast',
  'struct',
  'switch',
  'template',
  'this',
  'thread_local',
  'throw',
  'true',
  'try',
  'typedef',
  'typeid',
  'typename',
  'union',
  'unsigned',
  'using',
  'virtual',
  'void',
  'volatile',
  'wchar_t',
  'while',
  'xor',
  'xor_eq',
]);

const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export function isValidCppIdentifier(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  if (!IDENTIFIER_REGEX.test(name)) {
    return false;
  }
  return !CPP_KEYWORDS.has(name);
}

// ==========================================
// Template Mode Validation & Stitching
// ==========================================

export function extractTemplateRegions(templateSource: string): string[] {
  const regex = /\/\/\s*STUDENT_BEGIN\s+([A-Za-z0-9_]+)/g;
  const regions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(templateSource)) !== null) {
    regions.push(match[1]);
  }
  return regions;
}

export function validateTemplateRegions(
  templateSource: string,
  providedRegions: Record<string, string>
): { valid: boolean; error?: string } {
  if (!templateSource || typeof templateSource !== 'string') {
    return { valid: false, error: 'Template source is required and must be a string' };
  }
  if (!providedRegions || typeof providedRegions !== 'object' || Array.isArray(providedRegions)) {
    return { valid: false, error: 'Regions object is required' };
  }

  const declaredRegions = extractTemplateRegions(templateSource);
  if (declaredRegions.length === 0) {
    return { valid: false, error: 'Template source does not contain any STUDENT_BEGIN regions' };
  }

  const declaredSet = new Set(declaredRegions);
  const providedKeys = Object.keys(providedRegions);
  const providedSet = new Set(providedKeys);

  // Check for missing regions
  for (const declared of declaredSet) {
    if (!providedSet.has(declared)) {
      return { valid: false, error: `Missing region in submission: ${declared}` };
    }
  }

  // Check for extra regions
  for (const provided of providedSet) {
    if (!declaredSet.has(provided)) {
      return { valid: false, error: `Unexpected extra region in submission: ${provided}` };
    }
  }

  return { valid: true };
}

export function stitchTemplate(
  templateSource: string,
  regions: Record<string, string>
): { success: boolean; code?: string; error?: string } {
  const validation = validateTemplateRegions(templateSource, regions);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  let result = templateSource;
  for (const [name, code] of Object.entries(regions)) {
    const pattern = new RegExp(`//\\s*STUDENT_BEGIN\\s+${name}[\\s\\S]*?//\\s*STUDENT_END`, 'g');
    if (!pattern.test(result)) {
      return {
        success: false,
        error: `Matching STUDENT_BEGIN/STUDENT_END block not found for region: ${name}`,
      };
    }
    result = result.replace(pattern, `// STUDENT_BEGIN ${name}\n${code}\n// STUDENT_END`);
  }

  return { success: true, code: result };
}

// ==========================================
// Free Mode Validation & Code Generation
// ==========================================

export function validateFreeModeSpec(spec: FreeModeSpec): { valid: boolean; error?: string } {
  if (!spec || typeof spec !== 'object') {
    return { valid: false, error: 'Free mode specification is required' };
  }
  if (typeof spec.studentSource !== 'string') {
    return { valid: false, error: 'Student source must be a string' };
  }
  if (spec.entry) {
    if (typeof spec.entry !== 'object') {
      return { valid: false, error: 'Entry point specification must be an object' };
    }
    const { type, name, className } = spec.entry;
    if (type !== 'function' && type !== 'method') {
      return { valid: false, error: "Entry type must be either 'function' or 'method'" };
    }

    if (!isValidCppIdentifier(name)) {
      return {
        valid: false,
        error: `Entry function/method name '${name}' is invalid or is a C++ keyword`,
      };
    }

    if (type === 'method') {
      if (!className || typeof className !== 'string') {
        return { valid: false, error: 'className is required for method entry type' };
      }
      if (!isValidCppIdentifier(className)) {
        return {
          valid: false,
          error: `Entry className '${className}' is invalid or is a C++ keyword`,
        };
      }
    }
  }

  return { valid: true };
}

export function generateFreeModeCode(spec: FreeModeSpec): {
  success: boolean;
  code?: string;
  error?: string;
} {
  const validation = validateFreeModeSpec(spec);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { entry, studentSource, harness } = spec;
  if (!entry || !harness) {
    return { success: true, code: studentSource };
  }

  let preamble = '';
  if (entry.type === 'function') {
    preamble = ['#undef CPPDSA_ENTRY', `#define CPPDSA_ENTRY ${entry.name}`].join('\n');
  } else {
    preamble = [
      '#include <utility>',
      '#undef CPPDSA_ENTRY',
      `template<class... A> decltype(auto) CPPDSA_ENTRY(A&&... a){ static ${entry.className} o; return o.${entry.name}(std::forward<A>(a)...); }`,
    ].join('\n');
  }

  const combined = [
    '#line 1 "solution.cpp"',
    studentSource,
    '#line 1 "adapter_preamble.hpp"',
    preamble,
    '#line 1 "harness.cpp"',
    harness,
  ].join('\n\n');

  return { success: true, code: combined };
}

// ==========================================
// Recovery Pure Function (PROJECT_PLAN 3.4)
// ==========================================

export interface SubmissionForRecovery {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'SYSTEM_ERROR';
  updatedAt: Date | string | number;
  retryCount?: number;
}

export type RecoveryDecision =
  { action: 'RETRY'; retryCount: number } | { action: 'MARK_SYSTEM_ERROR' } | { action: 'NONE' };

/**
 * Pure decision function for stalled/lost submissions when grader restarts.
 * Rule: PENDING or RUNNING > 2 minutes -> resubmit up to 2 times, then SYSTEM_ERROR.
 */
export function decideRecovery(
  submission: SubmissionForRecovery,
  now: Date | string | number = new Date()
): RecoveryDecision {
  if (submission.status !== 'PENDING' && submission.status !== 'RUNNING') {
    return { action: 'NONE' };
  }

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const updatedMs =
    submission.updatedAt instanceof Date
      ? submission.updatedAt.getTime()
      : new Date(submission.updatedAt).getTime();

  const elapsedMs = nowMs - updatedMs;
  const TWO_MINUTES_MS = 2 * 60 * 1000;

  if (elapsedMs <= TWO_MINUTES_MS) {
    return { action: 'NONE' };
  }

  const currentRetries = submission.retryCount ?? 0;
  if (currentRetries < 2) {
    return { action: 'RETRY', retryCount: currentRetries + 1 };
  }

  return { action: 'MARK_SYSTEM_ERROR' };
}
