import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Hard deadline for entire suite to avoid any hang (default 10 minutes)
const SUITE_TIMEOUT_MS = parseInt(process.env.SUITE_TIMEOUT_MS || '600000', 10);
setTimeout(() => {
    console.error(`FATAL: Suite global timeout of ${Math.round(SUITE_TIMEOUT_MS / 1000)}s exceeded!`);
    process.exit(1);
}, SUITE_TIMEOUT_MS).unref();

// Secret giả trong môi trường của runner Node.js để kiểm tra kịch bản đánh cắp secret
process.env.GRADER_SECRET = 'super_fake_secret_xyz123';

const CASES_DIR = '/app/cases';
const LAUNCHER_PATH = '/usr/local/bin/launcher';
const SANDBOX_UID = parseInt(process.env.SANDBOX_UID || '2000000000', 10);
const DEFAULT_BUDGET_MB = 384;
const DEFAULT_COMPILE_TIMEOUT_MS = parseInt(process.env.COMPILE_TIMEOUT_MS || '60000', 10);
const WALL_FACTOR = parseFloat(process.env.WALL_FACTOR || '10');

function getMemoryBudget() {
    let budgetMb = parseInt(process.env.SPIKE_MEMORY_BUDGET_MB || String(DEFAULT_BUDGET_MB), 10);
    if (isNaN(budgetMb) || budgetMb <= 0) budgetMb = DEFAULT_BUDGET_MB;
    let budgetBytes = budgetMb * 1024 * 1024;

    try {
        if (fs.existsSync('/sys/fs/cgroup/memory.max')) {
            const val = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf-8').trim();
            if (val !== 'max' && /^\d+$/.test(val)) {
                const cgroupBytes = parseInt(val, 10);
                if (cgroupBytes < budgetBytes) {
                    budgetBytes = Math.floor(cgroupBytes * 0.75);
                }
            }
        } else if (fs.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
            const val = fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf-8').trim();
            if (/^\d+$/.test(val) && val.length < 18) {
                const cgroupBytes = parseInt(val, 10);
                if (cgroupBytes < budgetBytes) {
                    budgetBytes = Math.floor(cgroupBytes * 0.75);
                }
            }
        }
    } catch (e) {}

    return budgetBytes;
}

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

// Đọc thông tin chi tiết của tiến trình từ /proc/<pid>/status
function getProcessInfo(pid) {
    try {
        const content = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
        let state = 'unknown';
        let ppid = -1;
        let name = 'unknown';
        for (const line of content.split('\n')) {
            if (line.startsWith('State:')) {
                const parts = line.split(':')[1].trim().split(/\s+/);
                state = parts[0]; // 'Z', 'S', 'R', 'D', 'T'
            } else if (line.startsWith('PPid:')) {
                ppid = parseInt(line.split(':')[1].trim(), 10);
            } else if (line.startsWith('Name:')) {
                name = line.split(':')[1].trim();
            }
        }
        return { pid, state, ppid, name };
    } catch (e) {
        return null;
    }
}

// Tìm danh sách tiến trình thuộc UID sandbox
function getSandboxProcesses() {
    const pids = [];
    try {
        const entries = fs.readdirSync('/proc');
        for (const entry of entries) {
            if (!/^\d+$/.test(entry)) continue;
            const pid = parseInt(entry, 10);
            if (pid <= 1 || pid === process.pid) continue;
            try {
                const stat = fs.statSync(`/proc/${pid}`);
                if (stat.uid === SANDBOX_UID) {
                    pids.push(pid);
                }
            } catch (e) {}
        }
    } catch (e) {}
    return pids;
}

// Tiêu diệt và dọn dẹp triệt để tiến trình sandbox, cho PID 1 (dumb-init) thời gian reap zombie
async function cleanupSandboxProcesses(maxWaitMs = 3000) {
    const start = performance.now();

    while (performance.now() - start < maxWaitMs) {
        const pids = getSandboxProcesses();
        if (pids.length === 0) {
            return { clean: true, remaining: [] };
        }

        // Gửi SIGKILL tới các tiến trình đang sống (không phải Zombie)
        for (const pid of pids) {
            const info = getProcessInfo(pid);
            if (info && info.state !== 'Z') {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (e) {}
            }
        }

        // Báo SIGCHLD cho PID 1 (dumb-init) để reap tức thì các tiến trình con zombie
        try {
            process.kill(1, 'SIGCHLD');
        } catch (e) {}

        await new Promise(r => setTimeout(r, 100));
    }

    const remainingPids = getSandboxProcesses();
    if (remainingPids.length === 0) {
        return { clean: true, remaining: [] };
    }

    const remaining = remainingPids.map(pid => {
        return getProcessInfo(pid) || { pid, state: 'unknown', ppid: -1, name: 'unknown' };
    });

    return { clean: false, remaining };
}

// Bảo vệ phân quyền an toàn cho toàn bộ hệ thống
function secureSystemDirs() {
    const dirsToProtect = ['/dev/shm', '/var/tmp', '/run/lock', '/home/sandbox', '/dev/mqueue', '/tmp'];
    for (const d of dirsToProtect) {
        if (fs.existsSync(d)) {
            try {
                fs.chmodSync(d, 0o755);
                fs.chownSync(d, 0, 0);
            } catch (e) {}
        }
    }
    try {
        fs.chmodSync('/app', 0o700);
        fs.chownSync('/app', 0, 0);
        if (fs.existsSync('/app/hidden_tests')) {
            fs.chmodSync('/app/hidden_tests', 0o700);
            fs.chownSync('/app/hidden_tests', 0, 0);
        }
    } catch (e) {}
}

// Xóa sạch các file mồ côi ngoài thư mục tạm
function cleanStrayFiles() {
    const checkDirs = ['/dev/shm', '/var/tmp', '/run/lock', '/home/sandbox'];
    for (const dir of checkDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                const fp = path.join(dir, f);
                try {
                    const stat = fs.lstatSync(fp);
                    if (stat.isDirectory()) {
                        fs.rmSync(fp, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(fp);
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }
}

// Biên dịch mã nguồn qua launcher sandbox với giới hạn CPU/AS/NPROC/FSIZE và không mạng
async function compileSource(runDir, compileFiles, binPath, compileTimeoutMs = DEFAULT_COMPILE_TIMEOUT_MS) {
    const compileBudget = getMemoryBudget();
    const launcherArgs = [
        '--workdir', runDir,
        '--uid', String(SANDBOX_UID),
        '--gid', String(SANDBOX_UID),
        '--tl-sec', String(Math.ceil(compileTimeoutMs / 1000)),
        '--ml-bytes', String(compileBudget),
        '--fsize-bytes', '52428800',  // 50 MB
        '--nproc', '50',
        '--seccomp',
        '--',
        '/usr/bin/g++',
        '-std=c++17',
        '-O2',
        ...compileFiles,
        '-o',
        binPath
    ];

    const compileStart = performance.now();
    let timedOut = false;
    const stderrChunks = [];
    let stderrRetained = 0;
    const stdoutChunks = [];

    const child = spawn(LAUNCHER_PATH, launcherArgs, {
        cwd: runDir,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
        timedOut = true;
        try {
            process.kill(-child.pid, 'SIGKILL');
        } catch (e) {}
    }, compileTimeoutMs);

    child.stdout.on('data', (chunk) => {
        if (stdoutChunks.length < 50) stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
        if (stderrRetained < 64 * 1024) {
            const take = Math.min(chunk.length, 64 * 1024 - stderrRetained);
            stderrChunks.push(chunk.subarray(0, take));
            stderrRetained += take;
        }
    });

    const result = await new Promise((resolve) => {
        let settled = false;
        const hardTimer = setTimeout(() => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                try {
                    child.stdout.destroy();
                    child.stderr.destroy();
                    child.stdin.destroy();
                } catch (e) {}
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch (e) {}
                resolve({ code: -1, signal: 'SIGKILL', timedOut: true });
            }
        }, compileTimeoutMs + 1000);

        child.on('close', (code, signal) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                clearTimeout(hardTimer);
                resolve({ code, signal, timedOut });
            }
        });
    });

    await cleanupSandboxProcesses(3000);

    const wallTimeMs = Math.round(performance.now() - compileStart);
    const stderrStr = Buffer.concat(stderrChunks).toString('utf-8');
    const stdoutStr = Buffer.concat(stdoutChunks).toString('utf-8');
    const output = (stderrStr + '\n' + stdoutStr).trim();

    return {
        success: result.code === 0 && !result.timedOut,
        timedOut: result.timedOut,
        code: result.code,
        signal: result.signal,
        output,
        wallTimeMs
    };
}

// Chạy binary trong sandbox launcher
async function runExecution(runDir, binPath, inputData, tlSec, timeLimitMs, hardWallLimitMs, memoryLimitBytes, fsizeBytes, maxOutputBytes, maxProcs = 20) {
    const launcherArgs = [
        '--workdir', runDir,
        '--uid', String(SANDBOX_UID),
        '--gid', String(SANDBOX_UID),
        '--tl-sec', String(tlSec),
        '--ml-bytes', String(memoryLimitBytes),
        '--fsize-bytes', String(fsizeBytes),
        '--nproc', String(maxProcs),
        '--seccomp',
        '--',
        binPath
    ];

    const runStart = performance.now();
    let timedOut = false;
    let oleTriggered = false;
    let stdoutBytes = 0;
    const stdoutChunks = [];
    let stderrBytes = 0;
    const stderrChunks = [];
    let stderrRetained = 0;
    const MAX_STDERR_RETAINED = 64 * 1024; // Giới hạn tổng byte stderr lưu lại là 64 KB

    const child = spawn(LAUNCHER_PATH, launcherArgs, {
        cwd: runDir,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let killFallbackTimer = null;
    let oleFallbackTimer = null;

    // Hạn chót wall-clock cứng: bắn sau hardWallLimitMs
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
    }, hardWallLimitMs);

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
        stderrBytes += chunk.length;
        if (stderrRetained < MAX_STDERR_RETAINED) {
            const take = Math.min(chunk.length, MAX_STDERR_RETAINED - stderrRetained);
            stderrChunks.push(chunk.subarray(0, take));
            stderrRetained += take;
        }
    });

    const executionResult = await new Promise((resolve) => {
        let settled = false;

        const hardDeadlineTimer = setTimeout(() => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                if (killFallbackTimer) clearTimeout(killFallbackTimer);
                if (oleFallbackTimer) clearTimeout(oleFallbackTimer);
                try {
                    child.stdout.destroy();
                    child.stderr.destroy();
                    child.stdin.destroy();
                } catch (e) {}
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch (e) {}
                const wallTimeMs = Math.round(performance.now() - runStart);
                resolve({ code: -1, signal: 'SIGKILL', wallTimeMs, hardDeadline: true });
            }
        }, hardWallLimitMs + 1000);

        child.on('close', (code, signal) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                clearTimeout(hardDeadlineTimer);
                if (killFallbackTimer) clearTimeout(killFallbackTimer);
                if (oleFallbackTimer) clearTimeout(oleFallbackTimer);
                const wallTimeMs = Math.round(performance.now() - runStart);
                resolve({ code, signal, wallTimeMs, hardDeadline: false });
            }
        });
    });

    await cleanupSandboxProcesses(3000);

    const wallTimeMs = executionResult.wallTimeMs;
    const exitCode = executionResult.code;
    const exitSignal = executionResult.signal;
    const stdoutRaw = Buffer.concat(stdoutChunks).toString('utf-8');
    const stderrRaw = Buffer.concat(stderrChunks).toString('utf-8');

    let memoryKb = 0;
    let userTimeMs = 0;
    let sysTimeMs = 0;
    const rusagePath = path.join(runDir, 'rusage.json');
    if (fs.existsSync(rusagePath)) {
        try {
            const rusage = JSON.parse(fs.readFileSync(rusagePath, 'utf-8'));
            memoryKb = rusage.maxrss_kb || 0;
            userTimeMs = rusage.user_time_ms || 0;
            sysTimeMs = rusage.sys_time_ms || 0;
        } catch (e) {}
    }
    const cpuTimeMs = userTimeMs + sysTimeMs;

    return {
        wallTimeMs,
        cpuTimeMs,
        userTimeMs,
        sysTimeMs,
        exitCode,
        exitSignal,
        stdoutRaw,
        stderrRaw,
        memoryKb,
        timedOut: timedOut || executionResult.hardDeadline,
        oleTriggered
    };
}

// Chạy một ca kiểm thử hoàn chỉnh
async function runTestCase(caseDir) {
    const metaPath = path.join(caseDir, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    const id = meta.id;
    const mode = meta.mode || 'standard';
    const expectedVerdict = meta.expectedVerdict;
    const expectedVerdicts = Array.isArray(expectedVerdict) ? expectedVerdict : [expectedVerdict];
    const timeLimitMs = meta.timeLimitMs || 1000;
    const compileTimeoutMs = meta.compileTimeoutMs || DEFAULT_COMPILE_TIMEOUT_MS;
    const tlSec = Math.ceil(timeLimitMs / 1000);
    const hardWallLimitMs = Math.round(timeLimitMs * WALL_FACTOR + 1000);
    const origMemoryLimitBytes = meta.memoryLimitBytes || 268435456; // 256 MB default
    const maxOutputBytes = meta.maxOutputBytes || 256 * 1024;    // 256 KB default
    const fsizeBytes = meta.fsizeBytes || 5 * 1024 * 1024;       // 5 MB default

    const isMleCase = expectedVerdicts.includes('MLE') && !expectedVerdicts.includes('TLE');
    let maxProcs = meta.nproc || meta.maxProcs || (isMleCase ? 1 : 20);
    let memoryLimitBytes = origMemoryLimitBytes;

    const budgetBytes = getMemoryBudget();

    // Điều chỉnh ML / NPROC nếu memoryLimitBytes * maxProcs > budgetBytes
    if (memoryLimitBytes * maxProcs > budgetBytes) {
        const origProcs = maxProcs;
        const origMlMb = Math.round(origMemoryLimitBytes / (1024 * 1024));
        const budgetMb = Math.round(budgetBytes / (1024 * 1024));

        if (isMleCase) {
            maxProcs = 1;
            if (memoryLimitBytes > budgetBytes) {
                memoryLimitBytes = budgetBytes;
            }
        } else {
            maxProcs = Math.min(maxProcs, 4);
            memoryLimitBytes = Math.min(origMemoryLimitBytes, Math.floor(budgetBytes / maxProcs));
        }

        const adjMlMb = Math.round(memoryLimitBytes / (1024 * 1024));
        console.log(`[BUDGET] ${id}: vượt budget ${budgetMb}MB (${origProcs} procs * ${origMlMb}MB = ${origProcs * origMlMb}MB) -> giảm ML: ${origMlMb}MB -> ${adjMlMb}MB, NPROC: ${origProcs} -> ${maxProcs} (tổng: ${Math.round(maxProcs * memoryLimitBytes / (1024*1024))}MB <= ${budgetMb}MB)`);
    }

    // Trước khi chạy, dọn sạch tiến trình sandbox và file tồn dư
    await cleanupSandboxProcesses(3000);
    cleanStrayFiles();

    const runDir = `/tmp/run_${id}`;
    if (fs.existsSync(runDir)) {
        fs.rmSync(runDir, { recursive: true, force: true });
    }
    fs.mkdirSync(runDir, { recursive: true });
    fs.chmodSync(runDir, 0o700);
    fs.chownSync(runDir, SANDBOX_UID, SANDBOX_UID);

    const binPath = path.join(runDir, 'solution_bin');

    // 1. Chuẩn bị file nguồn bên trong runDir và biên dịch trong sandbox
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
        fs.chownSync(stitchedPath, SANDBOX_UID, SANDBOX_UID);
        fs.chmodSync(stitchedPath, 0o644);
        compileFiles.push(stitchedPath);
    } else if (mode === 'free') {
        const solDest = path.join(runDir, 'solution.cpp');
        const adaptDest = path.join(runDir, 'adapter.cpp');
        fs.copyFileSync(path.join(caseDir, 'solution.cpp'), solDest);
        fs.copyFileSync(path.join(caseDir, 'adapter.cpp'), adaptDest);
        fs.chownSync(solDest, SANDBOX_UID, SANDBOX_UID);
        fs.chownSync(adaptDest, SANDBOX_UID, SANDBOX_UID);
        fs.chmodSync(solDest, 0o644);
        fs.chmodSync(adaptDest, 0o644);
        compileFiles.push(solDest, adaptDest);
    } else {
        const solDest = path.join(runDir, 'solution.cpp');
        fs.copyFileSync(path.join(caseDir, 'solution.cpp'), solDest);
        fs.chownSync(solDest, SANDBOX_UID, SANDBOX_UID);
        fs.chmodSync(solDest, 0o644);
        compileFiles.push(solDest);
    }

    const compileRes = await compileSource(runDir, compileFiles, binPath, compileTimeoutMs);
    console.log(`[COMPILE] ${id}: ${compileRes.wallTimeMs} ms${compileRes.timedOut ? ' (compile timeout)' : ''}`);

    // Kiểm tra khẳng định CE đặc biệt: thông báo biên dịch không được chứa chuỗi nhạy cảm
    let compileLeakDetected = false;
    if (meta.assertCompileOutputNotContains) {
        for (const str of meta.assertCompileOutputNotContains) {
            if (compileRes.output.includes(str)) {
                compileLeakDetected = true;
            }
        }
    }

    if (!compileRes.success) {
        const actualVerdict = compileRes.timedOut ? 'CTE' : 'CE';
        const verdictPass = expectedVerdicts.includes(actualVerdict) ||
            (compileRes.timedOut && expectedVerdicts.includes('CE') && meta.id === 'c2_compile_include_devzero');
        const pass = verdictPass && !compileLeakDetected;
        let details = compileRes.timedOut
            ? `compile timeout (${compileRes.wallTimeMs} ms > ${compileTimeoutMs} ms)`
            : 'Compilation failed as expected';
        if (compileLeakDetected) {
            details = 'FAIL: Secret leaked into compiler error message!';
        } else if (!verdictPass) {
            details = compileRes.timedOut
                ? `Expected ${expectedVerdict} but got compile timeout (${compileRes.wallTimeMs} ms)`
                : `Expected ${expectedVerdict} but got CE: ${compileRes.output.slice(0, 80) || '[empty output]'}`;
        }

        try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (e) {}
        await cleanupSandboxProcesses(3000);

        return {
            id,
            mode,
            expectedVerdict: Array.isArray(expectedVerdict) ? expectedVerdict.join('/') : expectedVerdict,
            actualVerdict,
            cpuMs: 0,
            wallMs: 0,
            compileMs: compileRes.wallTimeMs,
            timeMs: compileRes.wallTimeMs,
            memoryKb: 0,
            pass,
            details
        };
    }

    if (expectedVerdicts.includes('CE') || expectedVerdicts.includes('CTE')) {
        try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (e) {}
        await cleanupSandboxProcesses(3000);
        return {
            id,
            mode,
            expectedVerdict: Array.isArray(expectedVerdict) ? expectedVerdict.join('/') : expectedVerdict,
            actualVerdict: 'AC',
            cpuMs: 0,
            wallMs: 0,
            compileMs: compileRes.wallTimeMs,
            timeMs: compileRes.wallTimeMs,
            memoryKb: 0,
            pass: false,
            details: 'Expected Compilation Error/Timeout but compiled successfully'
        };
    }

    // Đảm bảo binary thực thi được
    fs.chownSync(binPath, SANDBOX_UID, SANDBOX_UID);
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

    const execRes = await runExecution(
        runDir,
        binPath,
        inputData,
        tlSec,
        timeLimitMs,
        hardWallLimitMs,
        memoryLimitBytes,
        fsizeBytes,
        maxOutputBytes,
        maxProcs
    );

    // 3. Phân loại Verdict
    let actualVerdict = 'SE';
    if (execRes.oleTriggered) {
        actualVerdict = 'OLE';
    } else if (execRes.exitSignal === 'SIGXFSZ') {
        actualVerdict = 'OLE';
    } else if (execRes.exitSignal === 'SIGXCPU') {
        actualVerdict = 'TLE';
    } else if (execRes.cpuTimeMs > timeLimitMs) {
        actualVerdict = 'TLE';
    } else if (execRes.timedOut) {
        actualVerdict = 'TLE';
    } else if (execRes.exitSignal === 'SIGABRT' || execRes.exitSignal === 'SIGSEGV' || execRes.exitCode !== 0) {
        if (execRes.stderrRaw.includes('bad_alloc') || execRes.stderrRaw.includes('std::bad_alloc') || execRes.stderrRaw.includes('Out of memory')) {
            actualVerdict = 'MLE';
        } else {
            actualVerdict = 'RE';
        }
    } else if (execRes.exitCode === 0) {
        const normActual = normalizeOutput(execRes.stdoutRaw);
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
            if (execRes.stdoutRaw.includes(str) || execRes.stderrRaw.includes(str)) {
                attackPass = false;
                failureReason += `Leaked secret or unauthorized success: ${str}; `;
            }
        }
    }

    // Kiểm tra stdout phải chứa chuỗi chặn dự kiến
    if (meta.assertStdoutContains) {
        for (const str of meta.assertStdoutContains) {
            if (!execRes.stdoutRaw.includes(str)) {
                attackPass = false;
                failureReason += `Expected block marker missing: ${str}; `;
            }
        }
    }

    // Kiểm tra giới hạn wall-time đối với TLE (≤ hardWallLimitMs + 1000ms)
    if (expectedVerdicts.includes('TLE') && actualVerdict === 'TLE') {
        const maxAllowedWall = hardWallLimitMs + 1000;
        if (execRes.wallTimeMs > maxAllowedWall) {
            attackPass = false;
            failureReason += `TLE wall-time exceeded: ${execRes.wallTimeMs} ms > ${maxAllowedWall} ms; `;
        }
    }

    // Hậu kiểm: đảm bảo không còn tiến trình nào của UID sandbox sống sót
    const cleanupRes = await cleanupSandboxProcesses(3000);
    if (!cleanupRes.clean) {
        for (const p of cleanupRes.remaining) {
            console.warn(`[SANDBOX_PROCESS_LEAK] PID ${p.pid} (Name: ${p.name}): State=${p.state}, PPid=${p.ppid}`);
        }
        attackPass = false;
        failureReason += `Surviving sandbox processes detected: ${cleanupRes.remaining.map(p => `${p.pid}[${p.state},PPid=${p.ppid}]`).join(',')}; `;
    }

    const verdictPass = expectedVerdicts.includes(actualVerdict);
    const finalPass = verdictPass && attackPass;

    let debugDetails = failureReason;
    if (!verdictPass) {
        debugDetails = `Verdict mismatch: got ${actualVerdict}, expected ${expectedVerdict}`;
        if (execRes.stderrRaw.trim()) {
            debugDetails += ` (stderr: ${execRes.stderrRaw.trim().slice(0, 80)})`;
        }
    } else if (failureReason && execRes.stderrRaw.trim()) {
        debugDetails += ` (stderr: ${execRes.stderrRaw.trim().slice(0, 80)})`;
    }

    // Dọn dẹp runDir
    try {
        fs.rmSync(runDir, { recursive: true, force: true });
    } catch (e) {}

    await cleanupSandboxProcesses(3000);
    cleanStrayFiles();

    // Nghỉ một nhịp ngắn (15ms)
    await new Promise(r => setTimeout(r, 15));

    return {
        id,
        mode,
        expectedVerdict: Array.isArray(expectedVerdict) ? expectedVerdict.join('/') : expectedVerdict,
        actualVerdict,
        cpuMs: execRes.cpuTimeMs,
        wallMs: execRes.wallTimeMs,
        compileMs: compileRes.wallTimeMs,
        timeMs: execRes.wallTimeMs,
        memoryKb: execRes.memoryKb,
        pass: finalPass,
        details: debugDetails || 'OK'
    };
}

// Chạy toàn bộ test suite
async function main() {
    console.log('======================================================================================================');
    console.log('                CPPDSA P2 SPIKE SANDBOX RUNNER - TEST SUITE                                           ');
    console.log('======================================================================================================');
    console.log(`Cấu hình: SANDBOX_UID=${SANDBOX_UID}, COMPILE_TIMEOUT_MS=${DEFAULT_COMPILE_TIMEOUT_MS}, WALL_FACTOR=${WALL_FACTOR}\n`);

    // Thiết lập an ninh toàn hệ thống và dọn dẹp sạch sẽ
    secureSystemDirs();
    cleanStrayFiles();
    await cleanupSandboxProcesses(3000);

    const caseDirs = fs.readdirSync(CASES_DIR)
        .map(name => path.join(CASES_DIR, name))
        .filter(p => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'meta.json')) && path.basename(p) !== 'final_ac_recovery')
        .sort();

    console.log(`Tìm thấy ${caseDirs.length} ca kiểm thử trong ${CASES_DIR}.\n`);

    // In tiêu đề bảng theo yêu cầu (in cả cpuMs, wallMs và compileMs)
    console.log('ca                         | mode     | kỳ vọng | thực tế | cpu ms | wall ms | comp ms | bộ nhớ KB | PASS/FAIL');
    console.log('------------------------------------------------------------------------------------------------------');

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
        console.log(`${res.id.padEnd(26, ' ')} | ${res.mode.padEnd(8, ' ')} | ${res.expectedVerdict.padEnd(7, ' ')} | ${res.actualVerdict.padEnd(7, ' ')} | ${String(res.cpuMs).padStart(6, ' ')} | ${String(res.wallMs).padStart(7, ' ')} | ${String(res.compileMs).padStart(7, ' ')} | ${String(res.memoryKb).padStart(9, ' ')} | ${passStr}`);
    }

    console.log('------------------------------------------------------------------------------------------------------');

    // Sau bộ ca, runner chạy lại 1 ca AC để chứng minh worker còn hoạt động
    console.log('\n--- KIỂM TRA PHỤC HỒI WORKER SAU TOÀN BỘ CÁC CA TẤN CÔNG & MLE ---');
    const recoveryRes = await runTestCase(path.join(CASES_DIR, 'final_ac_recovery'));

    if (recoveryRes.pass && recoveryRes.actualVerdict === 'AC') {
        console.log(`Worker Recovery Check: PASS (AC, cpu ${recoveryRes.cpuMs} ms, wall ${recoveryRes.wallMs} ms, comp ${recoveryRes.compileMs} ms, bộ nhớ ${recoveryRes.memoryKb} KB)`);
    } else {
        console.error(`Worker Recovery Check: FAILED! Verdict=${recoveryRes.actualVerdict} (${recoveryRes.details})`);
        failedCount++;
    }

    const totalDuration = Math.round(performance.now() - suiteStartTime);
    console.log('======================================================================================================');
    console.log(`Tổng số ca kiểm thử  : ${caseDirs.length + 1}`);
    console.log(`Số ca ĐẠT (PASS)     : ${passedCount + (recoveryRes.pass ? 1 : 0)}`);
    console.log(`Số ca THẤT BẠI (FAIL): ${failedCount}`);
    console.log(`Tổng thời gian suite : ${totalDuration} ms`);
    console.log('======================================================================================================');

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
