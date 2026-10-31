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

  // 2. Kiểm tra không có chuỗi chứa 'CHƯA CHỐT' (mọi biến thể, có hoặc không ngoặc) trong cả 4 file
  for (const file of requiredFiles) {
    const filePath = path.join(docsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(/(?:\[[^\]\n]*CHƯA CHỐT[^\]\n]*\]|CHƯA CHỐT)/gi);
    if (matches) {
      for (const m of matches) {
        if (m === '[CHƯA CHỐT]') {
          errors.push(`File ${file} contains forbidden string '[CHƯA CHỐT]'`);
        } else {
          errors.push(`File ${file} contains forbidden variant of 'CHƯA CHỐT': '${m}'`);
        }
      }
    }
  }

  // Đọc mvp-requirements.json
  const mvpReqPath = path.join(import.meta.dirname, 'mvp-requirements.json');
  let mvpData = { requirements: [], requiredDecisionTopics: [] };
  if (fs.existsSync(mvpReqPath)) {
    try {
      mvpData = JSON.parse(fs.readFileSync(mvpReqPath, 'utf8'));
    } catch (e) {
      errors.push(`Failed to parse mvp-requirements.json: ${e.message}`);
    }
  } else {
    errors.push(`Missing mvp-requirements.json at ${mvpReqPath}`);
  }

  // 3. Kiểm tra REQUIREMENTS.md: US-xx, AC-US-xx-n, Bảng truy vết, Ánh xạ MVP
  const reqPath = path.join(docsDir, 'REQUIREMENTS.md');
  const reqContent = fs.readFileSync(reqPath, 'utf8');

  // Tìm các US-xx được định nghĩa (ví dụ: #### US-01: ...)
  const usHeaderRegex = /(?:^|\n)#{1,6}\s*(US-\d+)\b([^\n]*)/g;
  const userStories = [];
  let uMatch;
  while ((uMatch = usHeaderRegex.exec(reqContent)) !== null) {
    userStories.push({
      id: uMatch[1],
      index: uMatch.index,
      headerEnd: uMatch.index + uMatch[0].length,
      title: uMatch[2].trim(),
    });
  }

  if (userStories.length === 0) {
    errors.push('No user stories (US-xx) defined in REQUIREMENTS.md');
  }

  const definedUsSet = new Set(userStories.map((u) => u.id));

  // 3a. Bảng ánh xạ MVP -> US
  const mappedReqMap = new Map();
  const rRegex = /\|\s*(R-\d+)\s*\|\s*([^|\n]+)\|/g;
  let rMatch;
  while ((rMatch = rRegex.exec(reqContent)) !== null) {
    const rId = rMatch[1];
    const stories = rMatch[2].match(/US-\d+/g) || [];
    mappedReqMap.set(rId, stories);
  }

  for (const rItem of mvpData.requirements) {
    if (!mappedReqMap.has(rItem.id)) {
      errors.push(`MVP requirement ${rItem.id} ('${rItem.text}') is missing from MVP mapping table in REQUIREMENTS.md`);
    } else {
      const stories = mappedReqMap.get(rItem.id);
      if (stories.length === 0) {
        errors.push(`MVP requirement ${rItem.id} has no mapped user stories`);
      }
      for (const us of stories) {
        if (!definedUsSet.has(us)) {
          errors.push(`MVP requirement ${rItem.id} maps to undefined user story ${us} (heading not found)`);
        }
      }
    }
  }

  // 3b. Kiểm tra AC-US-xx-n phải nằm trong chính mục của US-xx, dạng bullet có nội dung
  for (let i = 0; i < userStories.length; i++) {
    const cur = userStories[i];
    const afterHeader = reqContent.slice(cur.headerEnd);
    const nextHeaderMatch = afterHeader.match(/\n#{1,6}\s+[^\n]*/);
    const sectionBody = nextHeaderMatch
      ? afterHeader.slice(0, nextHeaderMatch.index)
      : afterHeader;

    const bulletLines = sectionBody.split('\n').filter((line) => /^[ \t]*[-*]/.test(line));
    const ownAcs = [];

    for (const bLine of bulletLines) {
      const acInBullet = bLine.match(/AC-(US-\d+)-(\d+)/);
      if (acInBullet) {
        const usId = acInBullet[1];
        const num = acInBullet[2];
        const hasContent = /:\s*\S+/.test(bLine);
        if (!hasContent) {
          errors.push(`Acceptance criterion AC-${usId}-${num} under ${cur.id} has no description content`);
        }
        if (usId !== cur.id) {
          errors.push(`Acceptance criterion AC-${usId}-${num} is placed in wrong section (found under ${cur.id}, expected under ${usId})`);
        } else {
          ownAcs.push(`AC-${usId}-${num}`);
        }
      }
    }

    if (ownAcs.length === 0) {
      errors.push(`User story ${cur.id} has no acceptance criteria AC-${cur.id}-n in its section (must be bullet line with content)`);
    }

    // Kiểm tra thêm: nếu AC của US khác được nhắc tới trong section
    const allAcsInSection = sectionBody.match(/AC-(US-\d+)-\d+/g) || [];
    for (const acStr of allAcsInSection) {
      const mTarget = acStr.match(/AC-(US-\d+)-\d+/);
      if (mTarget && mTarget[1] !== cur.id) {
        const alreadyReported = errors.some((e) =>
          e.includes(`${acStr} is placed in wrong section (found under ${cur.id}`)
        );
        if (!alreadyReported) {
          errors.push(`Acceptance criterion ${acStr} is placed in wrong section (found under ${cur.id}, expected under ${mTarget[1]})`);
        }
      }
    }
  }

  // 3c. Bảng truy vết: tách cột theo `|`; cột phase (cột thứ 3) phải chứa ít nhất một P2–P10
  const traceTableMatch = reqContent.match(/## 5\.\s*Bảng truy vết yêu cầu[\s\S]*?(?=\n##\s|\n---\s*$|$)/);
  const traceTableText = traceTableMatch ? traceTableMatch[0] : '';
  const traceLines = traceTableText.split('\n');

  let phaseColIdx = 3;
  for (const line of traceLines) {
    if (line.includes('|') && /phase/i.test(line)) {
      const headerCols = line.split('|').map((c) => c.trim());
      const pIdx = headerCols.findIndex((c) => /phase/i.test(c));
      if (pIdx !== -1) {
        phaseColIdx = pIdx;
      }
      break;
    }
  }

  for (const us of userStories) {
    const rowLine = traceLines.find((line) => {
      if (!line.includes('|')) return false;
      const cols = line.split('|').map((c) => c.trim().replace(/\*/g, ''));
      return cols.length > 1 && cols[1] === us.id;
    });

    if (!rowLine) {
      errors.push(`User story ${us.id} is not mapped to any phase P2-P10 in traceability table`);
    } else {
      const cols = rowLine.split('|').map((c) => c.trim());
      const phaseVal = cols[phaseColIdx] || '';
      if (!/\b(P[2-9]|P10)\b/.test(phaseVal)) {
        errors.push(`User story ${us.id} phase column in traceability table ('${phaseVal}') does not contain any valid phase P2-P10`);
      }
    }
  }

  // 4. Kiểm tra DECISIONS.md
  const decPath = path.join(docsDir, 'DECISIONS.md');
  const decContent = fs.readFileSync(decPath, 'utf8');

  const dRegex = /(?:^|\n)#{1,6}\s*(D-\d+)\b([^\n]*)/g;
  const decisions = [];
  let dMatch;
  while ((dMatch = dRegex.exec(decContent)) !== null) {
    decisions.push({
      id: dMatch[1],
      index: dMatch.index,
      title: dMatch[2].trim(),
      heading: `${dMatch[1]}${dMatch[2]}`.trim(),
    });
  }

  if (decisions.length < 15) {
    errors.push(`Found ${decisions.length} decisions in DECISIONS.md, expected at least 15`);
  }

  // 4a. Kiểm tra requiredDecisionTopics: mỗi topic khớp >= 1 heading D-xx
  for (const topicItem of mvpData.requiredDecisionTopics) {
    const matched = decisions.some((d) => {
      const headingLower = d.heading.toLowerCase();
      return topicItem.keywords.some((kw) => headingLower.includes(kw.toLowerCase()));
    });
    if (!matched) {
      errors.push(`Missing required decision topic: '${topicItem.topic}' (no D-xx heading matched keywords: ${topicItem.keywords.join(', ')})`);
    }
  }

  // 4b. Kiểm tra 4 trường và định dạng Nguồn:
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

    const sourceMatch = sectionText.match(/(?:^|\n)\s*(?:\*\*)?Nguồn:(?:\*\*)?\s*([^\n]+)/);
    if (sourceMatch) {
      const sourceVal = sourceMatch[1].trim();
      const forbiddenPlaceholders = /\b(TODO|TBD)\b|[—?]|^-+$/i;
      const validSourcePattern = /PROJECT_PLAN|người dùng 20\d{2}-\d{2}-\d{2}/;
      if (forbiddenPlaceholders.test(sourceVal) || !validSourcePattern.test(sourceVal)) {
        errors.push(`Decision ${current.id} has invalid source '${sourceVal}' (must contain 'PROJECT_PLAN' or 'người dùng 20YY-MM-DD')`);
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
      mvpRequirementsChecked: mvpData.requirements.length,
      decisionTopicsChecked: mvpData.requiredDecisionTopics.length,
    },
  };
}

function ensureFixtures(fixturesDir) {
  const validDir = path.join(fixturesDir, 'valid');
  if (!fs.existsSync(validDir)) {
    fs.mkdirSync(validDir, { recursive: true });
  }

  const docsDir = path.join(process.cwd(), 'docs');
  const requiredFiles = ['REQUIREMENTS.md', 'ARCHITECTURE.md', 'DECISIONS.md', 'DATA_MODEL.md'];
  for (const f of requiredFiles) {
    const src = path.join(docsDir, f);
    const dst = path.join(validDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  const validReq = fs.readFileSync(path.join(validDir, 'REQUIREMENTS.md'), 'utf8');
  const validDec = fs.readFileSync(path.join(validDir, 'DECISIONS.md'), 'utf8');
  const validArch = fs.readFileSync(path.join(validDir, 'ARCHITECTURE.md'), 'utf8');
  const validData = fs.readFileSync(path.join(validDir, 'DATA_MODEL.md'), 'utf8');

  const writeFixture = (dirName, req, dec, arch = validArch, data = validData) => {
    const d = path.join(fixturesDir, dirName);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'REQUIREMENTS.md'), req, 'utf8');
    fs.writeFileSync(path.join(d, 'DECISIONS.md'), dec, 'utf8');
    fs.writeFileSync(path.join(d, 'ARCHITECTURE.md'), arch, 'utf8');
    fs.writeFileSync(path.join(d, 'DATA_MODEL.md'), data, 'utf8');
  };

  // m1: Thêm [CHƯA CHỐT: TL] vào REQUIREMENTS
  const m1Req = validReq.replace('## 1. Giới thiệu và mục tiêu', '## 1. Giới thiệu và mục tiêu [CHƯA CHỐT: TL]');
  writeFixture('m1-chua-chot-variant', m1Req, validDec);

  // m2: Xóa toàn bộ US-17 gồm heading, AC và dòng bảng truy vết
  const m2Req = validReq
    .replace(/#### US-17:[\s\S]*?(?=\n---\s*\n\n## 4\.)/, '')
    .replace(/\|\s*\*\*US-17\*\*[\s\S]*?\n/, '');
  writeFixture('m2-missing-us17', m2Req, validDec);

  // m3: Xóa D-09 (vẫn còn 15 D-xx)
  const m3Dec = validDec.replace(/### D-09:[\s\S]*?(?=\n---\s*\n\n### D-10:)/, '');
  writeFixture('m3-missing-d09', validReq, m3Dec);

  // m4: Xóa 2 dòng AC-US-01-n trong US-01 và chỉ nhắc AC-US-01-1 trong US-02
  const m4Req = validReq
    .replace(/- `AC-US-01-1`:[^\n]*\n/, '')
    .replace(/- `AC-US-01-2`:[^\n]*\n/, '- Không có AC ở đây.\n')
    .replace(
      '#### US-02: Tạo và cấu hình bài tập chế độ Template\n',
      '#### US-02: Tạo và cấu hình bài tập chế độ Template\n- `AC-US-01-1`: Tiêu chí AC-US-01-1 bị đặt nhầm vào mục US-02.\n'
    );
  writeFixture('m4-misplaced-ac', m4Req, validDec);

  // m5: Đổi một dòng thành Nguồn: TODO
  const m5Dec = validDec.replace(/Nguồn: PROJECT_PLAN mục 2 \(người dùng 2026-10-31\) và mục 3\.1\./, 'Nguồn: TODO');
  writeFixture('m5-invalid-source', validReq, m5Dec);

  // m6: Đổi dòng truy vết US-01 thành | **US-01** | Quản lý lớp | P1 | phụ thuộc kết quả P2 spike |
  const m6Req = validReq.replace(
    /\|\s*\*\*US-01\*\*[\s\S]*?\|\s*P3,\s*P5\s*\|[^\n]*/,
    '| **US-01** | Quản lý lớp học và import CSV | P1 | phụ thuộc kết quả P2 spike |'
  );
  writeFixture('m6-trace-phase-col', m6Req, validDec);
}

// Chế độ Self-test
function runSelfTest() {
  const fixturesDir = path.join(import.meta.dirname, 'fixtures');
  ensureFixtures(fixturesDir);
  console.log(`Running self-test against fixtures in ${fixturesDir}...\n`);

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
    // 6 mutation cases (m1 to m6)
    {
      name: 'fixture-m1-chua-chot-variant',
      dir: path.join(fixturesDir, 'm1-chua-chot-variant'),
      expectedPattern: /forbidden variant of 'CHƯA CHỐT'/,
    },
    {
      name: 'fixture-m2-missing-us17',
      dir: path.join(fixturesDir, 'm2-missing-us17'),
      expectedPattern: /maps to undefined user story US-17/,
    },
    {
      name: 'fixture-m3-missing-d09',
      dir: path.join(fixturesDir, 'm3-missing-d09'),
      expectedPattern: /Missing required decision topic: 'nộp sau deadline'/,
    },
    {
      name: 'fixture-m4-misplaced-ac',
      dir: path.join(fixturesDir, 'm4-misplaced-ac'),
      expectedPattern: /Acceptance criterion AC-US-01-1 is placed in wrong section/,
    },
    {
      name: 'fixture-m5-invalid-source',
      dir: path.join(fixturesDir, 'm5-invalid-source'),
      expectedPattern: /has invalid source 'TODO'/,
    },
    {
      name: 'fixture-m6-trace-phase-col',
      dir: path.join(fixturesDir, 'm6-trace-phase-col'),
      expectedPattern: /phase column in traceability table \('P1'\) does not contain any valid phase P2-P10/,
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
      const matchedErr = res.errors.find((e) => tc.expectedPattern.test(e));
      console.log(`[PASS] ${tc.name}: Checker correctly caught expected error: ${matchedErr}`);
    } else {
      console.error(`[FAIL] ${tc.name}: Errors found but did not match expected pattern ${tc.expectedPattern}`);
      console.error(`       Actual errors:`, res.errors);
      allPassed = false;
    }
  }

  // Kiểm tra fixture valid: phải PASS
  const validDir = path.join(fixturesDir, 'valid');
  if (!fs.existsSync(validDir)) {
    console.error(`[FAIL] Valid fixture directory missing: ${validDir}`);
    allPassed = false;
  } else {
    const validRes = verifyDocs(validDir);
    if (!validRes.pass) {
      console.error(`[FAIL] valid: Expected PASSED, but got errors:`, validRes.errors);
      allPassed = false;
    } else {
      console.log(`[PASS] valid: Valid documentation PASSED with 0 errors`);
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
    console.log(`- 0 'CHƯA CHỐT' strings or variants found`);
    console.log(`- User stories verified (with AC & Traceability): ${result.summary.userStoriesCount}`);
    console.log(`- MVP requirements mapped: ${result.summary.mvpRequirementsChecked}`);
    console.log(`- Decision topics verified: ${result.summary.decisionTopicsChecked}`);
    console.log(`- Decisions verified (with all 4 fields & valid Nguồn): ${result.summary.decisionsCount}`);
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
