/**
 * Comprehensive grading test cases covering:
 * - Template Mode (AC, WA, TLE, MLE, RE, CE)
 * - Free Mode Function & Method (AC, WA, TLE, MLE, RE, CE, wrong names)
 * - Boundary & whitespace cases
 * - Partial scoring (e.g. 2/3, 3/4)
 * - Validation errors (400 Bad Request)
 * - Anti-cheating & security attacks
 */

const TEMPLATE_SUM = `
#include <iostream>

// STUDENT_BEGIN solve
int solve(int a, int b);
// STUDENT_END

int main() {
    int a, b;
    if (std::cin >> a >> b) {
        std::cout << solve(a, b) << std::endl;
    }
    return 0;
}
`;

const FREE_HARNESS_FUNCTION = `
#include <iostream>

int main() {
    int a, b;
    if (std::cin >> a >> b) {
        std::cout << CPPDSA_ENTRY(a, b) << std::endl;
    }
    return 0;
}
`;

const FREE_HARNESS_METHOD = `
#include <iostream>

int main() {
    int a, b;
    if (std::cin >> a >> b) {
        std::cout << CPPDSA_ENTRY(a, b) << std::endl;
    }
    return 0;
}
`;

export const testCases = [
  // ==========================================
  // Category A: Template Mode standard cases
  // ==========================================
  {
    id: 'TC-01',
    name: 'Template mode AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { return a + b; }' },
      },
      hiddenTests: [{ id: '1', input: '10 20', expected: '30' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-02',
    name: 'Template mode WA (wrong algorithm)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { return a - b; }' },
      },
      hiddenTests: [{ id: '1', input: '10 20', expected: '30' }],
    },
    expected: { verdict: 'WA', score: 0 },
  },
  {
    id: 'TC-03',
    name: 'Template mode TLE (infinite loop)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 500,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { while(1); return a + b; }' },
      },
      hiddenTests: [{ id: '1', input: '10 20', expected: '30' }],
    },
    expected: { verdict: 'TLE', score: 0 },
  },
  {
    id: 'TC-04',
    name: 'Template mode MLE (memory allocation limit)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 2000,
      memoryLimitMb: 32, // 32 MB limit
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
#include <vector>

// STUDENT_BEGIN solve
void solve();
// STUDENT_END

int main() {
    solve();
    return 0;
}
`,
        regions: {
          solve: `void solve() {
            std::vector<std::vector<int>> v;
            while(true) {
                v.emplace_back(2000000, 42);
            }
          }`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: '0' }],
    },
    expected: { verdict: 'MLE', score: 0 },
  },
  {
    id: 'TC-05',
    name: 'Template mode RE (segmentation fault)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: {
          solve: 'int solve(int a, int b) { int* p = nullptr; *p = 100; return a + b; }',
        },
      },
      hiddenTests: [{ id: '1', input: '10 20', expected: '30' }],
    },
    expected: { verdict: 'RE', score: 0 },
  },
  {
    id: 'TC-06',
    name: 'Template mode CE (syntax error)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { invalid_syntax;;; }' },
      },
      hiddenTests: [{ id: '1', input: '10 20', expected: '30' }],
    },
    expected: { verdict: 'CE', score: 0 },
  },

  // ==========================================
  // Category B: Free Mode Function Entry cases
  // ==========================================
  {
    id: 'TC-07',
    name: 'Free mode function entry AC',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: 'customAdd' },
        studentSource: 'int customAdd(int x, int y) { return x + y; }',
      },
      hiddenTests: [{ id: '1', input: '15 25', expected: '40' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-08',
    name: 'Free mode function entry WA',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: 'customAdd' },
        studentSource: 'int customAdd(int x, int y) { return x * y; }',
      },
      hiddenTests: [{ id: '1', input: '15 25', expected: '40' }],
    },
    expected: { verdict: 'WA', score: 0 },
  },
  {
    id: 'TC-09',
    name: 'Free mode function entry TLE',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 500,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: 'customLoop' },
        studentSource: 'int customLoop(int x, int y) { while(1); return x+y; }',
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { verdict: 'TLE', score: 0 },
  },
  {
    id: 'TC-10',
    name: 'Free mode function entry MLE',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 2000,
      memoryLimitMb: 32,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: 'customMem' },
        studentSource: `
#include <vector>
int customMem(int x, int y) {
    std::vector<std::vector<int>> v;
    while(true) { v.emplace_back(1000000, 1); }
    return x + y;
}
`,
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { verdict: 'MLE', score: 0 },
  },
  {
    id: 'TC-11',
    name: 'Free mode function entry RE (uncaught throw)',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: 'customThrow' },
        studentSource: `
#include <stdexcept>
int customThrow(int, int) {
    throw std::runtime_error("Fatal logic error");
}
`,
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { verdict: 'RE', score: 0 },
  },
  {
    id: 'TC-12',
    name: 'Free mode function entry CE (syntax error)',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: 'customErr' },
        studentSource: 'int customErr(int a, int b) { return a + ; }',
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { verdict: 'CE', score: 0 },
  },

  // ==========================================
  // Category C: Free Mode Method Entry cases
  // ==========================================
  {
    id: 'TC-13',
    name: 'Free mode method entry AC',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_METHOD,
        entry: { type: 'method', name: 'compute', className: 'Calculator' },
        studentSource: `
class Calculator {
public:
    int compute(int a, int b) {
        return a * 10 + b;
    }
};
`,
      },
      hiddenTests: [{ id: '1', input: '3 7', expected: '37' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-14',
    name: 'Free mode CE (wrong method name specified in entry)',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_METHOD,
        entry: { type: 'method', name: 'nonExistentMethod', className: 'Calculator' },
        studentSource: `
class Calculator {
public:
    int actualMethod(int a, int b) { return a + b; }
};
`,
      },
      hiddenTests: [{ id: '1', input: '3 7', expected: '10' }],
    },
    expected: { verdict: 'CE', score: 0 },
  },
  {
    id: 'TC-15',
    name: 'Free mode CE (wrong className specified in entry)',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_METHOD,
        entry: { type: 'method', name: 'compute', className: 'MissingClass' },
        studentSource: `
class OtherClass {
public:
    int compute(int a, int b) { return a + b; }
};
`,
      },
      hiddenTests: [{ id: '1', input: '3 7', expected: '10' }],
    },
    expected: { verdict: 'CE', score: 0 },
  },

  // ==========================================
  // Category D: Boundary / Whitespace Cases
  // ==========================================
  {
    id: 'TC-16',
    name: 'Boundary: Output missing trailing newline is still AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: { solve: 'void solve() { std::cout << "result_text"; }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'result_text\n' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-17',
    name: 'Boundary: Output has extra trailing newlines is still AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: { solve: 'void solve() { std::cout << "result_text\\n\\n\\n"; }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'result_text' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-18',
    name: 'Boundary: Output trailing spaces on lines is still AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: { solve: 'void solve() { std::cout << "line1   \\nline2  \\t "; }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'line1\nline2' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-19',
    name: 'Boundary: Different whitespace in middle of line is WA',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: { solve: 'void solve() { std::cout << "hello   world"; }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'hello world' }],
    },
    expected: { verdict: 'WA', score: 0 },
  },
  {
    id: 'TC-20',
    name: 'Boundary: Empty output expected and empty actual is AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: { solve: 'void solve() { }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: '' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-21',
    name: 'Boundary: Execution quickly completes under TL is AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { return a + b; }' },
      },
      hiddenTests: [{ id: '1', input: '5 5', expected: '10' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },

  // ==========================================
  // Category E: Partial Scores / Multiple Tests
  // ==========================================
  {
    id: 'TC-22',
    name: 'Partial score: 3 tests, 2 AC and 1 WA -> WA, score 2/3 (0.6667)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        // Only returns right answer when a != 10
        regions: { solve: 'int solve(int a, int b) { return (a == 10) ? 999 : (a + b); }' },
      },
      hiddenTests: [
        { id: '1', input: '1 2', expected: '3' },
        { id: '2', input: '10 20', expected: '30' }, // This fails -> WA
        { id: '3', input: '3 4', expected: '7' },
      ],
    },
    expected: { verdict: 'WA', score: 0.6667 },
  },
  {
    id: 'TC-23',
    name: 'Partial score: 4 tests, 3 AC and 1 TLE -> TLE, score 3/4 (0.75)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 500,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { if (a == 10) while(1); return a + b; }' },
      },
      hiddenTests: [
        { id: '1', input: '1 2', expected: '3' },
        { id: '2', input: '2 3', expected: '5' },
        { id: '3', input: '10 20', expected: '30' }, // TLE here
        { id: '4', input: '4 5', expected: '9' },
      ],
    },
    expected: { verdict: 'TLE', score: 0.75 },
  },
  {
    id: 'TC-24',
    name: 'Multiple tests: All 3 AC -> AC, score 1 (3/3)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { return a + b; }' },
      },
      hiddenTests: [
        { id: '1', input: '1 2', expected: '3' },
        { id: '2', input: '10 20', expected: '30' },
        { id: '3', input: '100 200', expected: '300' },
      ],
    },
    expected: { verdict: 'AC', score: 1 },
  },

  // ==========================================
  // Category F: Job Validation (400 Bad Request)
  // ==========================================
  {
    id: 'TC-25',
    name: 'Validation: 0 hidden tests rejected with 400',
    mode: 'http-validation',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { return a + b; }' },
      },
      hiddenTests: [],
    },
    expected: { statusCode: 400 },
  },
  {
    id: 'TC-26',
    name: 'Validation: Template mode missing declared region rejected with 400',
    mode: 'http-validation',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: {}, // Missing 'solve'
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { statusCode: 400 },
  },
  {
    id: 'TC-27',
    name: 'Validation: Template mode extra undeclared region rejected with 400',
    mode: 'http-validation',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { return a + b; }', extra: 'int x = 1;' },
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { statusCode: 400 },
  },
  {
    id: 'TC-28',
    name: 'Validation: Template mode wrong region name rejected with 400',
    mode: 'http-validation',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { incorrectRegionName: 'int solve(int a, int b) { return a + b; }' },
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { statusCode: 400 },
  },
  {
    id: 'TC-29',
    name: 'Validation: Free mode keyword entry name rejected with 400',
    mode: 'http-validation',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: 'class' }, // C++ keyword
        studentSource: 'int solve() { return 0; }',
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { statusCode: 400 },
  },
  {
    id: 'TC-30',
    name: 'Validation: Free mode invalid identifier regex rejected with 400',
    mode: 'http-validation',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: '123-bad-name' },
        studentSource: 'int solve() { return 0; }',
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { statusCode: 400 },
  },

  // ==========================================
  // Category G: Anti-cheating & Sandbox Security
  // ==========================================
  {
    id: 'TC-31',
    name: 'Anti-cheating: Attempt to read /app/secret.txt -> RE/WA, not AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
#include <fstream>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: {
          solve: `void solve() {
            std::ifstream f("/app/secret.txt");
            if (f.is_open()) {
                std::string s;
                f >> s;
                std::cout << s;
            } else {
                std::cout << "ACCESS_DENIED";
            }
          }`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'EXPECTED_CANARY_VALUE_123' }],
    },
    expected: { verdict: 'WA', score: 0 },
  },
  {
    id: 'TC-32',
    name: 'Anti-cheating: Attempt to scan / via opendir -> cannot leak test files',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
#include <dirent.h>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: {
          solve: `void solve() {
            DIR* d = opendir("/app");
            if (d) {
                std::cout << "DIR_OPENED";
                closedir(d);
            } else {
                std::cout << "SCAN_FAILED";
            }
          }`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'DESIRED_OUTPUT' }],
    },
    expected: { verdict: 'WA', score: 0 },
  },
  {
    id: 'TC-33',
    name: 'Anti-cheating: Printing fake "AC" string does not get AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: { solve: 'void solve() { std::cout << "AC\\nAccepted\\n"; }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: '42' }],
    },
    expected: { verdict: 'WA', score: 0 },
  },
  {
    id: 'TC-34',
    name: 'Anti-cheating: Early exit(0) without output gets WA, not AC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
#include <cstdlib>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: { solve: 'void solve() { exit(0); }' },
      },
      hiddenTests: [{ id: '1', input: '', expected: '100' }],
    },
    expected: { verdict: 'WA', score: 0 },
  },
  {
    id: 'TC-35',
    name: 'Anti-cheating: Macro / closing brace breaking template causes CE',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { } } #define int double' },
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { verdict: 'CE', score: 0 },
  },
  {
    id: 'TC-36',
    name: 'Anti-cheating: Template mode submitting full file with main() causes CE',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: {
          solve: 'int solve(int a, int b) { return a + b; }\nint main() { return 0; }',
        },
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { verdict: 'CE', score: 0 },
  },
  {
    id: 'TC-37',
    name: 'Anti-cheating: Free mode student defining own main() causes CE',
    mode: 'free',
    job: {
      mode: 'free',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      free: {
        harness: FREE_HARNESS_FUNCTION,
        entry: { type: 'function', name: 'myFunc' },
        studentSource: 'int myFunc(int a, int b) { return a + b; }\nint main() { return 0; }',
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { verdict: 'CE', score: 0 },
  },
  {
    id: 'TC-38',
    name: 'Anti-cheating: #include /app/secret.txt causes CE without leaking secret in message',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
// STUDENT_BEGIN solve
#include "/app/secret.txt"
// STUDENT_END
int main() { return 0; }
`,
        regions: {
          solve: '#include "/app/secret.txt"',
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: '0' }],
    },
    expected: { verdict: 'CE', score: 0 },
  },
  {
    id: 'TC-39',
    name: 'Anti-cheating: Attempt to read /proc/*/environ cannot read grader secret',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
#include <fstream>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: {
          solve: `void solve() {
            std::ifstream f("/proc/1/environ");
            if (f.is_open()) {
                std::string s;
                f >> s;
                std::cout << s;
            } else {
                std::cout << "PROTECTED";
            }
          }`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'NORMAL' }],
    },
    expected: { verdict: 'WA', score: 0 },
  },
  {
    id: 'TC-40',
    name: 'Anti-cheating: Network calls (socket/connect) blocked by seccomp -> RE/WA',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: {
          solve: `void solve() {
            int sock = socket(AF_INET, SOCK_STREAM, 0);
            if (sock < 0) {
                std::cout << "BLOCKED_BY_SECCOMP";
            } else {
                std::cout << "NETWORK_OPEN";
                close(sock);
            }
          }`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'BLOCKED_BY_SECCOMP' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-41',
    name: 'Anti-cheating: Fork bomb blocked by RLIMIT_NPROC',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1500,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
#include <unistd.h>
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: {
          solve: `void solve() {
            for (int i = 0; i < 1000; i++) {
                fork();
            }
            std::cout << "DONE";
          }`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: 'EXPECTED' }],
    },
    expected: { verdict: ['RE', 'WA', 'TLE'], score: 0 },
  },
  {
    id: 'TC-42',
    name: 'Environment isolation: Student process runs with empty environ (count 0)',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
extern char **environ;
// STUDENT_BEGIN solve
int solve();
// STUDENT_END
int main() {
    std::cout << solve() << std::endl;
    return 0;
}
`,
        regions: {
          solve: `int solve() {
            int count = 0;
            if (environ) {
                for (char **e = environ; *e != nullptr; ++e) {
                    count++;
                }
            }
            return count;
          }`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: '0' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-43',
    name: 'Compiler message truncation: Huge compile error truncated to <= 2000 chars',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 3000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
// STUDENT_BEGIN solve
void solve();
// STUDENT_END
int main() { solve(); return 0; }
`,
        regions: {
          solve: `void solve() {\n${Array.from({ length: 300 }, (_, i) => `  very_long_undeclared_function_name_triggering_compiler_diagnostic_line_${i}();`).join('\n')}\n}`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: '0' }],
    },
    expected: { verdict: 'CE', score: 0, maxCompileMessageLength: 2000 },
  },
  {
    id: 'TC-44',
    name: 'Sandbox filesystem isolation: Cannot write to /home, /dev/shm, /tmp, /var/tmp, ../',
    mode: 'template',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      compare: 'trim-trailing',
      template: {
        source: `
#include <iostream>
#include <fstream>
#include <unistd.h>
#include <pwd.h>

bool can_write(const std::string& path) {
    std::ofstream ofs(path);
    if (!ofs.is_open()) return false;
    ofs << "test";
    ofs.close();
    unlink(path.c_str());
    return true;
}

// STUDENT_BEGIN solve
int solve();
// STUDENT_END

int main() {
    std::cout << solve() << std::endl;
    return 0;
}
`,
        regions: {
          solve: `int solve() {
            int writable_count = 0;
            uid_t u = getuid();
            struct passwd *pw = getpwuid(u);
            if (pw && pw->pw_dir) {
                std::string p = std::string(pw->pw_dir) + "/x";
                if (can_write(p)) writable_count++;
            }
            char home_path[128];
            snprintf(home_path, sizeof(home_path), "/home/sandbox%u/x", (unsigned)u);
            if (can_write(home_path)) writable_count++;

            if (can_write("/dev/shm/x")) writable_count++;
            if (can_write("/tmp/x")) writable_count++;
            if (can_write("/var/tmp/x")) writable_count++;
            if (can_write("../x")) writable_count++;
            return writable_count;
          }`,
        },
      },
      hiddenTests: [{ id: '1', input: '', expected: '0' }],
    },
    expected: { verdict: 'AC', score: 1 },
  },
  {
    id: 'TC-45',
    name: 'Validation: Job exceeding memory budget (500MB > 400MB) rejected with HTTP 400',
    mode: 'http-validation',
    job: {
      mode: 'template',
      language: 'cpp17',
      timeLimitMs: 1000,
      memoryLimitMb: 500,
      compare: 'trim-trailing',
      template: {
        source: TEMPLATE_SUM,
        regions: { solve: 'int solve(int a, int b) { return a + b; }' },
      },
      hiddenTests: [{ id: '1', input: '1 2', expected: '3' }],
    },
    expected: { statusCode: 400 },
  },
];
