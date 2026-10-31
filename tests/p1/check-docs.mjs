import fs from 'node:fs';
import path from 'node:path';

export function verifyDocs(docsDir) {
  const errors = [];
  const requiredFiles = [
    'REQUIREMENTS.md',
    'ARCHITECTURE.md',
    'DECISIONS.md',
    'DATA_MODEL.md',
  ];

  // 1. Kiểm tra đủ 4 file tài liệu
  for (const file of requiredFiles) {
    const filePath = path.join(docsDir, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing required file: ${file}`);
    }
  }

  if (errors.length > 0) {
    return { pass: false, errors };
  }

  // 2. Kiểm tra không có chuỗi [CHƯA CHỐT] trong cả 4 file
  for (const file of requiredFiles) {
    const filePath = path.join(docsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('[CHƯA CHỐT]')) {
      errors.push(`File ${file} contains forbidden string '[CHƯA CHỐT]'`);
    }
  }

  // 3. Kiểm tra REQUIREMENTS.md: US-xx có AC-US-xx-n và bảng truy vết P2-P10
  const reqPath = path.join(docsDir, 'REQUIREMENTS.md');
  const reqContent = fs.readFileSync(reqPath, 'utf8');

  // Tìm các US-xx được định nghĩa (ví dụ: #### US-01: ...)
  const usRegex = /(?:^|\n)#{1,6}\s*(US-\d+)\b[^\n]*/g;
  const userStories = [];
  let match;
  while ((match = usRegex.exec(reqContent)) !== null) {
    userStories.push(match[1]);
  }

  if (userStories.length === 0) {
    errors.push('No user stories (US-xx) defined in REQUIREMENTS.md');
  }

  // Tách bảng truy vết
  const traceTableMatch = reqContent.match(/## 5\.\s*Bảng truy vết yêu cầu[\s\S]*?(?=\n##\s|\n---\s*$|$)/);
  const traceTableText = traceTableMatch ? traceTableMatch[0] : '';

  for (const us of userStories) {
    // Kiểm tra có ít nhất 1 AC-US-xx-n
    const acRegex = new RegExp(`\\bAC-${us}-\\d+\\b`);
    if (!acRegex.test(reqContent)) {
      errors.push(`User story ${us} has no acceptance criteria AC-${us}-n`);
    }

    // Kiểm tra xuất hiện trong bảng truy vết với ít nhất một phase P2-P10
    const usTraceRegex = new RegExp(`\\|\\s*(?:\\*\\*)?${us}(?:\\*\\*)?\\s*\\|[^\\n]*?\\b(P[2-9]|P10)\\b`, 'i');
    if (!usTraceRegex.test(traceTableText)) {
      errors.push(`User story ${us} is not mapped to any phase P2-P10 in traceability table`);
    }
  }

  // 4. Kiểm tra DECISIONS.md: mỗi D-xx có đủ 4 dòng bắt buộc và >= 15 D-xx
  const decPath = path.join(docsDir, 'DECISIONS.md');
  const decContent = fs.readFileSync(decPath, 'utf8');

  const dRegex = /(?:^|\n)#{1,6}\s*(D-\d+)\b([^\n]*)/g;
  const decisions = [];
  let dMatch;
  while ((dMatch = dRegex.exec(decContent)) !== null) {
    decisions.push({
      id: dMatch[1],
      index: dMatch.index,
    });
  }

  if (decisions.length < 15) {
    errors.push(`Found ${decisions.length} decisions in DECISIONS.md, expected at least 15`);
  }

  for (let i = 0; i < decisions.length; i++) {
    const current = decisions[i];
    const startIndex = current.index;
    const endIndex = i + 1 < decisions.length ? decisions[i + 1].index : decContent.length;
    const sectionText = decContent.slice(startIndex, endIndex);

    const requiredFields = [
      { name: 'Lựa chọn:', regex: /(?:^|\n)\s*(?:\*\*)?Lựa chọn:(?:\*\*)?\s*\S+/ },
      { name: 'Lý do:', regex: /(?:^|\n)\s*(?:\*\*)?Lý do:(?:\*\*)?\s*\S+/ },
      { name: 'Phương án loại:', regex: /(?:^|\n)\s*(?:\*\*)?Phương án loại:(?:\*\*)?\s*\S+/ },
      { name: 'Nguồn:', regex: /(?:^|\n)\s*(?:\*\*)?Nguồn:(?:\*\*)?\s*\S+/ },
    ];

    for (const field of requiredFields) {
      if (!field.regex.test(sectionText)) {
        errors.push(`Decision ${current.id} missing required field: ${field.name}`);
      }
    }
  }

  // 5. Kiểm tra tag [CẦN XÁC MINH] và các từ khóa bắt buộc
  let totalVerifyTags = 0;
  const linesWithVerifyTag = [];

  for (const file of requiredFiles) {
    const filePath = path.join(docsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(/\[CẦN XÁC MINH/g);
    if (matches) {
      totalVerifyTags += matches.length;
    }
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes('[CẦN XÁC MINH')) {
        linesWithVerifyTag.push(line);
      }
    }
  }

  if (totalVerifyTags < 7) {
    errors.push(`Found ${totalVerifyTags} '[CẦN XÁC MINH' tag(s) across docs, expected at least 7`);
  }

  const requiredKeywords = [
    '12 tháng',
    'Singapore',
    'outbound IP',
    'B1MS',
    'Hobby',
    'GitHub Actions',
    'rewrite',
  ];

  for (const kw of requiredKeywords) {
    const found = linesWithVerifyTag.some((line) => line.includes(kw));
    if (!found) {
      errors.push(`Missing required '[CẦN XÁC MINH' tag on same line with keyword '${kw}'`);
    }
  }

  return {
    pass: errors.length === 0,
    errors,
    summary: {
      filesChecked: requiredFiles.length,
      userStoriesCount: userStories.length,
      decisionsCount: decisions.length,
      verifyTagsCount: totalVerifyTags,
    },
  };
}

// Chế độ Self-test
function runSelfTest() {
  const fixturesDir = path.join(import.meta.dirname, 'fixtures');
  console.log(`Running self-test against fixtures in ${fixturesDir}...`);

  const cases = [
    {
      name: 'fixture-missing-ac',
      dir: path.join(fixturesDir, 'missing-ac'),
      expectedPattern: /has no acceptance criteria AC-/,
    },
    {
      name: 'fixture-has-chua-chot',
      dir: path.join(fixturesDir, 'has-chua-chot'),
      expectedPattern: /forbidden string '\[CHƯA CHỐT\]'/,
    },
    {
      name: 'fixture-dxx-missing-field',
      dir: path.join(fixturesDir, 'dxx-missing-field'),
      expectedPattern: /missing required field:/,
    },
    {
      name: 'fixture-us-missing-trace',
      dir: path.join(fixturesDir, 'us-missing-trace'),
      expectedPattern: /User story US-99 is not mapped to any phase P2-P10 in traceability table/,
    },
    {
      name: 'fixture-missing-verify-tag',
      dir: path.join(fixturesDir, 'missing-verify-tag'),
      expectedPattern: /CẦN XÁC MINH/,
    },
  ];

  let allPassed = true;

  for (const tc of cases) {
    if (!fs.existsSync(tc.dir)) {
      console.error(`[FAIL] Fixture directory missing: ${tc.dir}`);
      allPassed = false;
      continue;
    }

    const res = verifyDocs(tc.dir);
    if (res.pass) {
      console.error(`[FAIL] ${tc.name}: Expected errors, but checker PASSED`);
      allPassed = false;
      continue;
    }

    const matched = res.errors.some((err) => tc.expectedPattern.test(err));
    if (matched) {
      console.log(`[PASS] ${tc.name}: Checker correctly caught expected error: ${res.errors.find(e => tc.expectedPattern.test(e))}`);
    } else {
      console.error(`[FAIL] ${tc.name}: Errors found but did not match expected pattern ${tc.expectedPattern}`);
      console.error(`       Actual errors:`, res.errors);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log('\n--- SELF-TEST RESULT: ALL FIXTURE TESTS PASSED ---');
    process.exit(0);
  } else {
    console.error('\n--- SELF-TEST RESULT: FAILED ---');
    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  runSelfTest();
} else {
  const docsDir = args[0] ? path.resolve(args[0]) : path.join(process.cwd(), 'docs');
  console.log(`Checking documentation in: ${docsDir}`);
  const result = verifyDocs(docsDir);

  if (result.pass) {
    console.log(`\nAll checks PASSED!`);
    console.log(`- Required files present: ${result.summary.filesChecked}`);
    console.log(`- 0 '[CHƯA CHỐT]' strings found`);
    console.log(`- User stories verified (with AC & Traceability): ${result.summary.userStoriesCount}`);
    console.log(`- Decisions verified (with all 4 fields): ${result.summary.decisionsCount}`);
    console.log(`- Verification tags '[CẦN XÁC MINH': ${result.summary.verifyTagsCount} found with all required keywords`);
    process.exit(0);
  } else {
    console.error(`\nDocumentation check FAILED with ${result.errors.length} error(s):`);
    result.errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err}`);
    });
    process.exit(1);
  }
}
