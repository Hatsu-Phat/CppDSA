import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Secret giả trong môi trường của runner Node.js để kiểm tra kịch bản đánh cắp secret
process.env.GRADER_SECRET = 'super_fake_secret_xyz123';

const CASES_DIR = '/app/cases';
const LAUNCHER_PATH = '/usr/local/bin/launcher';

// Chuẩn hóa output theo docs/REQUIREMENTS.md §4.4
export function normalizeOutput(text) {
    if (typeof text !== 'string') return '';
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let lines = normalized.split('\n').map(line => line.trimEnd());
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines.join('\n');
}

// Ghép code template theo docs/examples/template-mode
export function stitchTemplate(templateCode, regions) {
    let result = templateCode;
    for (const [name, code] of Object.entries(regions)) {
        const regex = new RegExp(`(//\\s*STUDENT_BEGIN\\s+${name}[\\s\\S]*?//\\s*STUDENT_END)`, 'g');
        const replacement = `// STUDENT_BEGIN ${name}\n${code}\n// STUDENT_END`;
        result = result.replace(regex, replacement);
    }
    return result;
}

// Chạy một ca kiểm thử
async function runTestCase(caseDir) {
    const metaPath = path.join(caseDir, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    const id = meta.id;
    const mode = meta.mode || 'standard';
    const expectedVerdict = meta.expectedVerdict;
    const timeLimitMs = meta.timeLimitMs || 1000;
    const tlSec = Math.ceil(timeLimitMs / 1000);
    const memoryLimitBytes = meta.memoryLimitBytes || 268435456; // 256 MB default
    const maxOutputBytes = meta.maxOutputBytes || 256 * 1024; // 256 KB default
    const fsizeBytes = meta.fsizeBytes || 5 * 1024 * 1024; // 5 MB

    const runDir = `/tmp/run_${id}`;
    if (fs.existsSync(runDir)) {
        fs.rmSync(runDir, { recursive: true, force: true });
    }
    fs.mkdirSync(runDir, { recursive: true });
    fs.chmodSync(runDir, 0o700);
    fs.chownSync(runDir, 10001, 10001); // sandbox user

    const binPath = path.join(runDir, 'solution_bin');

    // 1. Chuẩn bị file nguồn và biên dịch
    let compileFiles = [];
    if (mode === 'template') {
        const templateCode = fs.readFileSync(path.join(caseDir, 'template.cpp'), 'utf-8');
        let solutionCode = '';
        if (fs.existsSync(path.join(caseDir, 'solution.cpp'))) {
            solutionCode = fs.readFileSync(path.join(caseDir, 'solution.cpp'), 'utf-8');
        }
        let regions = {};
        if (fs.existsSync(path.join(caseDir, 'regions.json'))) {
            regions = JSON.parse(fs.readFileSync(path.join(caseDir, 'regions.json'), 'utf-8'));
        } else {
            const regionName = meta.regionName || 'reverseLinkedList';
            regions[regionName] = solutionCode;
        }
        const stitched = stitchTemplate(templateCode, regions);
        const stitchedPath = path.join(runDir, 'stitched.cpp');
        fs.writeFileSync(stitchedPath, stitched, 'utf-8');
        compileFiles.push(stitchedPath);
    } else if (mode === 'free') {
        compileFiles.push(path.join(caseDir, 'solution.cpp'));
        compileFiles.push(path.join(caseDir, 'adapter.cpp'));
    } else {
        compileFiles.push(path.join(caseDir, 'solution.cpp'));
    }

    const compileCmd = `g++ -std=c++17 -O2 ${compileFiles.map(f => `"${f}"`).join(' ')} -o "${binPath}"`;
    const compileRes = spawnSync(compileCmd, {
        shell: true,
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 64 * 1024
    });

    if (compileRes.status !== 0) {
        const actualVerdict = 'CE';
        const isPass = actualVerdict === expectedVerdict;
        fs.rmSync(runDir, { recursive: true, force: true });
        return {
            id,
            mode,
            expectedVerdict,
            actualVerdict,
            timeMs: 0,
            memoryKb: 0,
            pass: isPass,
            details: isPass ? 'Compilation failed as expected' : `Expected ${expectedVerdict} but got CE: ${compileRes.stderr.slice(0, 100)}`
        };
    }

    if (expectedVerdict === 'CE') {
        fs.rmSync(runDir, { recursive: true, force: true });
        return {
            id,
            mode,
            expectedVerdict,
            actualVerdict: 'AC',
            timeMs: 0,
            memoryKb: 0,
            pass: false,
            details: 'Expected Compilation Error (CE) but compiled successfully'
        };
    }

    // Đảm bảo binary thực thi thuộc sở hữu của sandbox
    fs.chownSync(binPath, 10001, 10001);
    fs.chmodSync(binPath, 0o755);

    // 2. Chạy chương trình trong sandbox launcher
    let inputData = '';
    if (fs.existsSync(path.join(caseDir, 'input.txt'))) {
        inputData = fs.readFileSync(path.join(caseDir, 'input.txt'), 'utf-8');
    }

    let expectedOutput = '';
    if (fs.existsSync(path.join(caseDir, 'expected.txt'))) {
        expectedOutput = fs.readFileSync(path.join(caseDir, 'expected.txt'), 'utf-8');
    }

    const runStart = performance.now();
    let timedOut = false;
    let oleTriggered = false;
    let stdoutBytes = 0;
    const stdoutChunks = [];
    const stderrChunks = [];

    const launcherArgs = [
        '--workdir', runDir,
        '--uid', '10001',
        '--gid', '10001',
        '--tl-sec', String(tlSec),
        '--ml-bytes', String(memoryLimitBytes),
        '--fsize-bytes', String(fsizeBytes),
        '--nproc', '20',
        '--seccomp',
        '--',
        binPath
    ];

    const child = spawn(LAUNCHER_PATH, launcherArgs, {
        cwd: runDir,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let killFallbackTimer = null;
    let oleFallbackTimer = null;

    const timer = setTimeout(() => {
        timedOut = true;
        try {
            process.kill(-child.pid, 'SIGTERM');
        } catch (e) {}
        killFallbackTimer = setTimeout(() => {
            try {
                process.kill(-child.pid, 'SIGKILL');
            } catch (e) {}
        }, 100);
    }, timeLimitMs + 50);

    child.stdin.on('error', () => {});
    if (inputData) {
        child.stdin.write(inputData);
    }
    child.stdin.end();

    child.stdout.on('data', (chunk) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxOutputBytes) {
            oleTriggered = true;
            try {
                process.kill(-child.pid, 'SIGTERM');
            } catch (e) {}
            oleFallbackTimer = setTimeout(() => {
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch (e) {}
            }, 50);
        } else {
            stdoutChunks.push(chunk);
        }
    });

    child.stderr.on('data', (chunk) => {
        if (chunk.length <= 64 * 1024) {
            stderrChunks.push(chunk);
        }
    });

    const executionResult = await new Promise((resolve) => {
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            if (killFallbackTimer) clearTimeout(killFallbackTimer);
            if (oleFallbackTimer) clearTimeout(oleFallbackTimer);
            const wallTimeMs = Math.round(performance.now() - runStart);
            resolve({ code, signal, wallTimeMs });
        });
    });

    const wallTimeMs = executionResult.wallTimeMs;
    const exitCode = executionResult.code;
    const exitSignal = executionResult.signal;
    const stdoutRaw = Buffer.concat(stdoutChunks).toString('utf-8');
    const stderrRaw = Buffer.concat(stderrChunks).toString('utf-8');

    // Đọc rusage.json từ launcher nếu có
    let memoryKb = 0;
    const rusagePath = path.join(runDir, 'rusage.json');
    if (fs.existsSync(rusagePath)) {
        try {
            const rusage = JSON.parse(fs.readFileSync(rusagePath, 'utf-8'));
            memoryKb = rusage.maxrss_kb || 0;
        } catch (e) {}
    }

    // 3. Phân loại Verdict
    let actualVerdict = 'SE';
    if (oleTriggered) {
        actualVerdict = 'OLE';
    } else if (timedOut) {
        actualVerdict = 'TLE';
    } else if (exitSignal === 'SIGXCPU') {
        actualVerdict = 'TLE';
    } else if (exitSignal === 'SIGXFSZ') {
        actualVerdict = 'OLE';
    } else if (exitSignal === 'SIGABRT' || exitSignal === 'SIGSEGV' || exitCode !== 0) {
        if (stderrRaw.includes('bad_alloc') || stderrRaw.includes('std::bad_alloc') || stderrRaw.includes('Out of memory')) {
            actualVerdict = 'MLE';
        } else {
            actualVerdict = 'RE';
        }
    } else if (exitCode === 0) {
        const normActual = normalizeOutput(stdoutRaw);
        const normExpected = normalizeOutput(expectedOutput);
        if (normActual === normExpected) {
            actualVerdict = 'AC';
        } else {
            actualVerdict = 'WA';
        }
    }

    // 4. Kiểm tra các điều kiện an ninh và hiệu ứng thật (Attack Assertions)
    let attackPass = true;
    let failureReason = '';

    // Kiểm tra file ngoài thư mục tạm không được phép tồn tại
    if (meta.assertFilesDoNotExist) {
        for (const file of meta.assertFilesDoNotExist) {
            if (fs.existsSync(file)) {
                attackPass = false;
                failureReason += `File was created outside temp: ${file}; `;
            }
        }
    }

    // Kiểm tra stdout/stderr không được chứa chuỗi nhạy cảm
    if (meta.assertStdoutNotContains) {
        for (const str of meta.assertStdoutNotContains) {
            if (stdoutRaw.includes(str) || stderrRaw.includes(str)) {
                attackPass = false;
                failureReason += `Leaked secret or unauthorized success: ${str}; `;
            }
        }
    }

    // Kiểm tra stdout phải chứa thông báo chặn
    if (meta.assertStdoutContains) {
        for (const str of meta.assertStdoutContains) {
            if (!stdoutRaw.includes(str)) {
                attackPass = false;
                failureReason += `Expected block marker missing: ${str}; `;
            }
        }
    }

    // Kiểm tra giới hạn wall-time đối với TLE (≤ TL + 500ms)
    if (expectedVerdict === 'TLE') {
        const maxAllowedWall = timeLimitMs + 500;
        if (wallTimeMs > maxAllowedWall) {
            attackPass = false;
            failureReason += `TLE wall-time exceeded: ${wallTimeMs} ms > ${maxAllowedWall} ms; `;
        }
    }

    const verdictPass = actualVerdict === expectedVerdict;
    const finalPass = verdictPass && attackPass;

    let debugDetails = failureReason;
    if (!verdictPass) {
        debugDetails = `Verdict mismatch: got ${actualVerdict}, expected ${expectedVerdict}`;
        if (stderrRaw.trim()) {
            debugDetails += ` (stderr: ${stderrRaw.trim().slice(0, 80)})`;
        }
    } else if (failureReason && stderrRaw.trim()) {
        debugDetails += ` (stderr: ${stderrRaw.trim().slice(0, 80)})`;
    }

    // Dọn dẹp runDir
    try {
        fs.rmSync(runDir, { recursive: true, force: true });
    } catch (e) {}

    // Nghỉ một nhịp ngắn (15ms) để bảo đảm hệ điều hành thu hồi tiến trình sạch sẽ
    await new Promise(r => setTimeout(r, 15));

    return {
        id,
        mode,
        expectedVerdict,
        actualVerdict,
        timeMs: wallTimeMs,
        memoryKb,
        pass: finalPass,
        details: debugDetails || 'OK'
    };
}

// Chạy toàn bộ test suite
async function main() {
    console.log('========================================================================================');
    console.log('                CPPDSA P2 SPIKE SANDBOX RUNNER - TEST SUITE                             ');
    console.log('========================================================================================');

    // Đảm bảo các thư mục hệ thống có phân quyền an toàn
    try {
        fs.chmodSync('/tmp', 0o755);
        if (!fs.existsSync('/app/hidden_tests')) {
            fs.mkdirSync('/app/hidden_tests', { recursive: true });
            fs.writeFileSync('/app/hidden_tests/secret.txt', 'super_secret_hidden_flag_12345\n');
        }
        fs.chmodSync('/app/hidden_tests', 0o700);
        fs.chownSync('/app/hidden_tests', 0, 0);
    } catch (e) {}

    const caseDirs = fs.readdirSync(CASES_DIR)
        .map(name => path.join(CASES_DIR, name))
        .filter(p => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'meta.json')))
        .sort();

    console.log(`Tìm thấy ${caseDirs.length} ca kiểm thử trong ${CASES_DIR}.\n`);

    // In tiêu đề bảng theo yêu cầu
    console.log('ca | mode | kỳ vọng | thực tế | thời gian ms | bộ nhớ KB | PASS/FAIL');
    console.log('----------------------------------------------------------------------------------------');

    const suiteStartTime = performance.now();
    let passedCount = 0;
    let failedCount = 0;
    const results = [];

    for (const caseDir of caseDirs) {
        const res = await runTestCase(caseDir);
        results.push(res);
        if (res.pass) {
            passedCount++;
        } else {
            failedCount++;
        }

        const passStr = res.pass ? 'PASS' : `FAIL (${res.details})`;
        console.log(`${res.id.padEnd(24, ' ')} | ${res.mode.padEnd(8, ' ')} | ${res.expectedVerdict.padEnd(7, ' ')} | ${res.actualVerdict.padEnd(7, ' ')} | ${String(res.timeMs).padStart(12, ' ')} | ${String(res.memoryKb).padStart(9, ' ')} | ${passStr}`);
    }

    console.log('----------------------------------------------------------------------------------------');

    // Sau bộ ca, runner chạy lại 1 ca AC để chứng minh worker còn hoạt động
    console.log('\n--- KIỂM TRA PHỤC HỒI WORKER SAU TOÀN BỘ CÁC CA TẤN CÔNG & MLE ---');
    const recoveryRes = await runTestCase(path.join(CASES_DIR, 'final_ac_recovery'));

    if (recoveryRes.pass && recoveryRes.actualVerdict === 'AC') {
        console.log(`Worker Recovery Check: PASS (AC, thời gian ${recoveryRes.timeMs} ms, bộ nhớ ${recoveryRes.memoryKb} KB)`);
    } else {
        console.error(`Worker Recovery Check: FAILED! Verdict=${recoveryRes.actualVerdict} (${recoveryRes.details})`);
        failedCount++;
    }

    const totalDuration = Math.round(performance.now() - suiteStartTime);
    console.log('========================================================================================');
    console.log(`Tổng số ca kiểm thử  : ${caseDirs.length}`);
    console.log(`Số ca ĐẠT (PASS)     : ${passedCount}`);
    console.log(`Số ca THẤT BẠI (FAIL): ${failedCount}`);
    console.log(`Tổng thời gian suite : ${totalDuration} ms`);
    console.log('========================================================================================');

    if (failedCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal runner error:', err);
    process.exit(1);
});
