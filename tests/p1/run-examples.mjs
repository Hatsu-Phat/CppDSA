import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function normalizeOutput(str) {
  if (!str) return '';
  return str
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();
}

function pad(str, len) {
  return String(str).padEnd(len);
}

function printTable(rows, headers = ['Mode', 'Test Case / Step', 'Expected Verdict', 'Actual Verdict', 'Status'], colWidths = [18, 22, 18, 18, 10]) {
  const headerLine = headers.map((h, i) => pad(h, colWidths[i])).join(' | ');
  const sepLine = colWidths.map((w) => '-'.repeat(w)).join('-|-');

  console.log(`| ${headerLine} |`);
  console.log(`|-${sepLine}-|`);

  for (const row of rows) {
    const rowLine = row.map((c, i) => pad(c, colWidths[i])).join(' | ');
    console.log(`| ${rowLine} |`);
  }
}

export function discoverTestCases(testsDir) {
  if (!fs.existsSync(testsDir)) {
    throw new Error(`Tests directory not found: ${testsDir}`);
  }
  const files = fs.readdirSync(testsDir);
  const inFiles = files.filter((f) => f.endsWith('.in')).sort();

  if (inFiles.length < 2) {
    throw new Error(`Expected at least 2 test cases in ${testsDir}, found ${inFiles.length}`);
  }

  const testCases = [];
  for (const inFile of inFiles) {
    const tcName = path.basename(inFile, '.in');
    const outFile = `${tcName}.out`;
    if (!fs.existsSync(path.join(testsDir, outFile))) {
      throw new Error(`Missing matching expected output file '${outFile}' for test case '${tcName}' in ${testsDir}`);
    }
    testCases.push(tcName);
  }
  return testCases;
}

export function runGrading(examplesDir, { silent = false } = {}) {
  const results = [];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-grader-'));

  try {
    // =========================================================================
    // 1. TEMPLATE MODE
    // =========================================================================
    const templateDir = path.join(examplesDir, 'template-mode');
    const templateCode = fs.readFileSync(path.join(templateDir, 'template.cpp'), 'utf8');
    const studentTemplateSol = fs.readFileSync(path.join(templateDir, 'solution.cpp'), 'utf8');

    // Ghép template với code sinh viên
    const markerRegex = /\/\/\s*STUDENT_BEGIN\s+reverseLinkedList[\s\S]*?\/\/\s*STUDENT_END/;
    if (!markerRegex.test(templateCode)) {
      results.push(['Template Mode', 'Marker Check', 'Valid Marker', 'Missing Marker', 'FAIL']);
      return { pass: false, results, error: "Template code missing '// STUDENT_BEGIN reverseLinkedList' marker" };
    }

    const stitchedCode = templateCode.replace(
      markerRegex,
      `// STUDENT_BEGIN reverseLinkedList\n${studentTemplateSol}\n// STUDENT_END`
    );

    const templateSrcFile = path.join(tempDir, 'template_stitched.cpp');
    const templateBin = path.join(tempDir, 'template_bin');
    fs.writeFileSync(templateSrcFile, stitchedCode, 'utf8');

    // Biên dịch
    const tCompile = spawnSync('g++', ['-std=c++17', '-O2', templateSrcFile, '-o', templateBin], {
      encoding: 'utf8',
    });

    if (tCompile.status !== 0) {
      results.push(['Template Mode', 'Compile', 'Compilation Success', 'CE', 'FAIL']);
      if (!silent) console.error('Template compilation error:', tCompile.stderr);
    } else {
      const templateTestsDir = path.join(templateDir, 'tests');
      let testCases = [];
      try {
        testCases = discoverTestCases(templateTestsDir);
      } catch (err) {
        results.push(['Template Mode', 'Discover Tests', 'Valid Tests (>=2)', err.message, 'FAIL']);
        return { pass: false, results, error: err.message };
      }

      for (const tc of testCases) {
        const inputData = fs.readFileSync(path.join(templateTestsDir, `${tc}.in`), 'utf8');
        const expectedData = fs.readFileSync(path.join(templateTestsDir, `${tc}.out`), 'utf8');

        const runRes = spawnSync(templateBin, [], {
          input: inputData,
          encoding: 'utf8',
          timeout: 5000,
        });

        if (runRes.status !== 0) {
          results.push(['Template Mode', tc, 'AC', 'RE', 'FAIL']);
        } else {
          const actualNorm = normalizeOutput(runRes.stdout);
          const expectedNorm = normalizeOutput(expectedData);
          const isMatch = actualNorm === expectedNorm;
          results.push([
            'Template Mode',
            tc,
            'AC',
            isMatch ? 'AC' : 'WA',
            isMatch ? 'PASS' : 'FAIL',
          ]);
        }
      }
    }

    // =========================================================================
    // 2. FREE MODE
    // =========================================================================
    const freeDir = path.join(examplesDir, 'free-mode');
    const adapterPath = path.join(freeDir, 'adapter.cpp');
    const freeSolPath = path.join(freeDir, 'solution.cpp');
    const freeAltPath = path.join(freeDir, 'solution_alt.cpp');
    const freeCePath = path.join(freeDir, 'solution_ce.cpp');
    const freeWaPath = path.join(freeDir, 'solution_wa.cpp');
    const freeTestsDir = path.join(freeDir, 'tests');

    let freeTestCases = [];
    try {
      freeTestCases = discoverTestCases(freeTestsDir);
    } catch (err) {
      results.push(['Free Mode', 'Discover Tests', 'Valid Tests (>=2)', err.message, 'FAIL']);
      return { pass: false, results, error: err.message };
    }

    // 2.1. Lời giải đúng (Expected: AC trên mọi hidden test)
    const freeBin = path.join(tempDir, 'free_bin');
    const fCompile = spawnSync('g++', ['-std=c++17', '-O2', freeSolPath, adapterPath, '-o', freeBin], {
      encoding: 'utf8',
    });

    if (fCompile.status !== 0) {
      results.push(['Free Mode (Valid)', 'Compile', 'Compilation Success', 'CE', 'FAIL']);
      if (!silent) console.error('Free mode compilation error:', fCompile.stderr);
    } else {
      for (const tc of freeTestCases) {
        const inputData = fs.readFileSync(path.join(freeTestsDir, `${tc}.in`), 'utf8');
        const expectedData = fs.readFileSync(path.join(freeTestsDir, `${tc}.out`), 'utf8');

        const runRes = spawnSync(freeBin, [], {
          input: inputData,
          encoding: 'utf8',
          timeout: 5000,
        });

        if (runRes.status !== 0) {
          results.push(['Free Mode (Valid)', tc, 'AC', 'RE', 'FAIL']);
        } else {
          const actualNorm = normalizeOutput(runRes.stdout);
          const expectedNorm = normalizeOutput(expectedData);
          const isMatch = actualNorm === expectedNorm;
          results.push([
            'Free Mode (Valid)',
            tc,
            'AC',
            isMatch ? 'AC' : 'WA',
            isMatch ? 'PASS' : 'FAIL',
          ]);
        }
      }
    }

    // 2.2. Lời giải thay thế (solution_alt.cpp: Brute-force O(n^2), đúng chữ ký, kỳ vọng AC mọi test)
    const altBin = path.join(tempDir, 'alt_bin');
    const altCompile = spawnSync('g++', ['-std=c++17', '-O2', freeAltPath, adapterPath, '-o', altBin], {
      encoding: 'utf8',
    });

    if (altCompile.status !== 0) {
      results.push(['Free Mode (Alt)', 'Compile', 'Compilation Success', 'CE', 'FAIL']);
      if (!silent) console.error('Free mode alt compilation error:', altCompile.stderr);
    } else {
      for (const tc of freeTestCases) {
        const inputData = fs.readFileSync(path.join(freeTestsDir, `${tc}.in`), 'utf8');
        const expectedData = fs.readFileSync(path.join(freeTestsDir, `${tc}.out`), 'utf8');

        const runRes = spawnSync(altBin, [], {
          input: inputData,
          encoding: 'utf8',
          timeout: 5000,
        });

        if (runRes.status !== 0) {
          results.push(['Free Mode (Alt)', tc, 'AC', 'RE', 'FAIL']);
        } else {
          const actualNorm = normalizeOutput(runRes.stdout);
          const expectedNorm = normalizeOutput(expectedData);
          const isMatch = actualNorm === expectedNorm;
          results.push([
            'Free Mode (Alt)',
            tc,
            'AC',
            isMatch ? 'AC' : 'WA',
            isMatch ? 'PASS' : 'FAIL',
          ]);
        }
      }
    }

    // 2.3. Lời giải sai chữ ký (Expected: CE - Thất bại khi biên dịch/liên kết)
    const ceBin = path.join(tempDir, 'ce_bin');
    const ceCompile = spawnSync('g++', ['-std=c++17', '-O2', freeCePath, adapterPath, '-o', ceBin], {
      encoding: 'utf8',
    });

    const isCe = ceCompile.status !== 0;
    results.push([
      'Free Mode (Wrong Sig)',
      'solution_ce.cpp',
      'CE',
      isCe ? 'CE' : 'Compiled OK',
      isCe ? 'PASS' : 'FAIL',
    ]);

    // 2.4. Lời giải sai kết quả (Expected: WA trên ít nhất 1 test)
    const waBin = path.join(tempDir, 'wa_bin');
    const waCompile = spawnSync('g++', ['-std=c++17', '-O2', freeWaPath, adapterPath, '-o', waBin], {
      encoding: 'utf8',
    });

    if (waCompile.status !== 0) {
      results.push(['Free Mode (Wrong Ans)', 'Compile', 'Compilation Success', 'CE', 'FAIL']);
    } else {
      let waFound = false;
      for (const tc of freeTestCases) {
        const inputData = fs.readFileSync(path.join(freeTestsDir, `${tc}.in`), 'utf8');
        const expectedData = fs.readFileSync(path.join(freeTestsDir, `${tc}.out`), 'utf8');

        const runRes = spawnSync(waBin, [], {
          input: inputData,
          encoding: 'utf8',
          timeout: 5000,
        });

        const actualNorm = normalizeOutput(runRes.stdout);
        const expectedNorm = normalizeOutput(expectedData);
        if (actualNorm !== expectedNorm) {
          waFound = true;
        }
      }

      results.push([
        'Free Mode (Wrong Ans)',
        'solution_wa.cpp',
        'WA (at least 1 test)',
        waFound ? 'WA' : 'All Matched (Unexpected)',
        waFound ? 'PASS' : 'FAIL',
      ]);
    }

    const hasFailure = results.some((r) => r[4] === 'FAIL');
    return {
      pass: !hasFailure,
      results,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runSelfTest() {
  console.log('Running self-test against 6 grader mutations...\n');
  const rootDir = process.cwd();
  const originalExamplesDir = path.join(rootDir, 'docs', 'examples');

  const cases = [
    {
      id: 'original',
      name: 'Bản gốc (docs/examples)',
      desc: 'Bản gốc không sửa đổi',
      expectedOutcome: 'PASS',
      mutate: (dir) => {},
    },
    {
      id: 'm1',
      name: 'm1: Lời giải template sai',
      desc: 'Hàm reverse trả về nullptr',
      expectedOutcome: 'FAIL',
      mutate: (dir) => {
        const solPath = path.join(dir, 'template-mode', 'solution.cpp');
        fs.writeFileSync(solPath, 'ListNode* reverseLinkedList(ListNode* head) { return nullptr; }\n', 'utf8');
      },
    },
    {
      id: 'm2',
      name: 'm2: Lời giải free đúng thay bằng WA',
      desc: 'solution.cpp bị thay bằng solution_wa.cpp',
      expectedOutcome: 'FAIL',
      mutate: (dir) => {
        const solPath = path.join(dir, 'free-mode', 'solution.cpp');
        const waPath = path.join(dir, 'free-mode', 'solution_wa.cpp');
        fs.copyFileSync(waPath, solPath);
      },
    },
    {
      id: 'm3',
      name: 'm3: Bản CE thay bằng lời giải đúng',
      desc: 'solution_ce.cpp bị thay bằng solution.cpp',
      expectedOutcome: 'FAIL',
      mutate: (dir) => {
        const cePath = path.join(dir, 'free-mode', 'solution_ce.cpp');
        const solPath = path.join(dir, 'free-mode', 'solution.cpp');
        fs.copyFileSync(solPath, cePath);
      },
    },
    {
      id: 'm4',
      name: 'm4: Expected bị đổi',
      desc: 'test1.out bị đổi thành giá trị sai',
      expectedOutcome: 'FAIL',
      mutate: (dir) => {
        const outPath = path.join(dir, 'template-mode', 'tests', 'test1.out');
        fs.writeFileSync(outPath, '999999\n', 'utf8');
      },
    },
    {
      id: 'm5',
      name: 'm5: Bản WA thay bằng lời giải đúng',
      desc: 'solution_wa.cpp bị thay bằng solution.cpp',
      expectedOutcome: 'FAIL',
      mutate: (dir) => {
        const waPath = path.join(dir, 'free-mode', 'solution_wa.cpp');
        const solPath = path.join(dir, 'free-mode', 'solution.cpp');
        fs.copyFileSync(solPath, waPath);
      },
    },
    {
      id: 'm6',
      name: 'm6: Thêm test3 với expected sai',
      desc: 'Thêm test3.in và test3.out với kết quả sai',
      expectedOutcome: 'FAIL',
      mutate: (dir) => {
        const testsDir = path.join(dir, 'free-mode', 'tests');
        fs.writeFileSync(path.join(testsDir, 'test3.in'), '3 6\n3 2 4\n', 'utf8');
        fs.writeFileSync(path.join(testsDir, 'test3.out'), '999 999\n', 'utf8');
      },
    },
  ];

  const tableRows = [];
  let allPassed = true;

  for (const tc of cases) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-selftest-'));
    try {
      fs.cpSync(originalExamplesDir, tempDir, { recursive: true });
      tc.mutate(tempDir);
      const res = runGrading(tempDir, { silent: true });
      const actualOutcome = res.pass ? 'PASS' : 'FAIL';
      const isDetected = actualOutcome === tc.expectedOutcome;
      if (!isDetected) {
        allPassed = false;
      }
      tableRows.push([
        tc.name,
        tc.desc,
        tc.expectedOutcome,
        actualOutcome,
        isDetected ? 'PASS' : 'FAIL',
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  printTable(
    tableRows,
    ['Ca kiểm thử', 'Mô tả thay đổi', 'Kỳ vọng Grader', 'Thực tế Grader', 'Trạng thái'],
    [32, 40, 16, 16, 10]
  );

  if (allPassed) {
    console.log('\n--- SELF-TEST RESULT: ALL 6 MUTATIONS DETECTED & ORIGINAL PASSED ---');
    process.exit(0);
  } else {
    console.error('\n--- SELF-TEST RESULT: FAILED ---');
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    await runSelfTest();
    return;
  }

  const rootDir = process.cwd();
  const examplesDir = path.join(rootDir, 'docs', 'examples');

  console.log('Testing grading contracts for Template Mode and Free Mode...\n');
  const res = runGrading(examplesDir, { silent: false });
  printTable(res.results);

  if (!res.pass) {
    console.error('\nOne or more test cases FAILED!');
    process.exit(1);
  } else {
    console.log('\nAll grading contracts and examples PASSED successfully!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running examples:', err);
  process.exit(1);
});
