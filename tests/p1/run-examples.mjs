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

function printTable(rows) {
  const headers = ['Mode', 'Test Case / Step', 'Expected Verdict', 'Actual Verdict', 'Status'];
  const colWidths = [18, 22, 18, 18, 10];

  const headerLine = headers.map((h, i) => pad(h, colWidths[i])).join(' | ');
  const sepLine = colWidths.map((w) => '-'.repeat(w)).join('-|-');

  console.log(`| ${headerLine} |`);
  console.log(`|-${sepLine}-|`);

  for (const row of rows) {
    const rowLine = row.map((c, i) => pad(c, colWidths[i])).join(' | ');
    console.log(`| ${rowLine} |`);
  }
}

async function main() {
  const results = [];
  const rootDir = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-grader-'));

  try {
    console.log('Testing grading contracts for Template Mode and Free Mode...\n');

    // =========================================================================
    // 1. TEMPLATE MODE
    // =========================================================================
    const templateDir = path.join(rootDir, 'docs', 'examples', 'template-mode');
    const templateCode = fs.readFileSync(path.join(templateDir, 'template.cpp'), 'utf8');
    const studentTemplateSol = fs.readFileSync(path.join(templateDir, 'solution.cpp'), 'utf8');

    // Ghép template với code sinh viên
    const markerRegex = /\/\/\s*STUDENT_BEGIN\s+reverseLinkedList[\s\S]*?\/\/\s*STUDENT_END/;
    if (!markerRegex.test(templateCode)) {
      throw new Error("Template code missing '// STUDENT_BEGIN reverseLinkedList' marker");
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
      console.error('Template compilation error:', tCompile.stderr);
    } else {
      // Chạy các hidden tests
      const testsDir = path.join(templateDir, 'tests');
      const testCases = ['test1', 'test2'];

      for (const tc of testCases) {
        const inputData = fs.readFileSync(path.join(testsDir, `${tc}.in`), 'utf8');
        const expectedData = fs.readFileSync(path.join(testsDir, `${tc}.out`), 'utf8');

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
    const freeDir = path.join(rootDir, 'docs', 'examples', 'free-mode');
    const adapterPath = path.join(freeDir, 'adapter.cpp');
    const freeSolPath = path.join(freeDir, 'solution.cpp');
    const freeAltPath = path.join(freeDir, 'solution_alt.cpp');
    const freeCePath = path.join(freeDir, 'solution_ce.cpp');
    const freeWaPath = path.join(freeDir, 'solution_wa.cpp');
    const freeTestsDir = path.join(freeDir, 'tests');

    // 2.1. Lời giải đúng (Expected: AC trên mọi hidden test)
    const freeBin = path.join(tempDir, 'free_bin');
    const fCompile = spawnSync('g++', ['-std=c++17', '-O2', freeSolPath, adapterPath, '-o', freeBin], {
      encoding: 'utf8',
    });

    if (fCompile.status !== 0) {
      results.push(['Free Mode (Valid)', 'Compile', 'Compilation Success', 'CE', 'FAIL']);
      console.error('Free mode compilation error:', fCompile.stderr);
    } else {
      for (const tc of ['test1', 'test2']) {
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
      console.error('Free mode alt compilation error:', altCompile.stderr);
    } else {
      for (const tc of ['test1', 'test2']) {
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
      for (const tc of ['test1', 'test2']) {
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

    // =========================================================================
    // In bảng kết quả
    // =========================================================================
    printTable(results);

    const hasFailure = results.some((r) => r[4] === 'FAIL');
    if (hasFailure) {
      console.error('\nOne or more test cases FAILED!');
      process.exit(1);
    } else {
      console.log('\nAll grading contracts and examples PASSED successfully!');
      process.exit(0);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Fatal error running examples:', err);
  process.exit(1);
});
