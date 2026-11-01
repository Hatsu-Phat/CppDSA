import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const PORT = (process.env.PORT !== undefined && process.env.PORT !== '')
    ? parseInt(process.env.PORT, 10)
    : 10000;

const SANDBOX_UID = parseInt(process.env.SANDBOX_UID || '2000000000', 10);

const startTime = Date.now();
let isTaskRunning = false;
let runningTaskName = null;

// Constant-time secret verification
function verifySecret(req) {
    const expected = process.env.SPIKE_SECRET;
    if (!expected || expected.trim() === '') {
        return { ok: false, status: 503, message: 'Server SPIKE_SECRET is not configured' };
    }
    const headerVal = req.headers['x-spike-secret'];
    if (typeof headerVal !== 'string' || headerVal.length === 0) {
        return { ok: false, status: 401, message: 'Missing X-Spike-Secret header' };
    }
    const expectedBuf = Buffer.from(expected, 'utf-8');
    const providedBuf = Buffer.from(headerVal, 'utf-8');
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        return { ok: false, status: 401, message: 'Invalid X-Spike-Secret' };
    }
    return { ok: true };
}

function getCgroupMemoryLimit() {
    try {
        if (fs.existsSync('/sys/fs/cgroup/memory.max')) {
            return fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf-8').trim();
        }
        if (fs.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
            return fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf-8').trim();
        }
    } catch (e) {}
    return null;
}

function getProcSelfStatus() {
    const result = { Seccomp: null, NoNewPrivs: null, CapEff: null };
    try {
        const content = fs.readFileSync('/proc/self/status', 'utf-8');
        for (const line of content.split('\n')) {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join(':').trim();
                if (key === 'Seccomp' || key === 'NoNewPrivs' || key === 'CapEff') {
                    result[key] = val;
                }
            }
        }
    } catch (e) {}
    return result;
}

function getSandboxProcessCount(uid) {
    let count = 0;
    try {
        const entries = fs.readdirSync('/proc');
        for (const entry of entries) {
            if (!/^\d+$/.test(entry)) continue;
            try {
                const stat = fs.statSync(`/proc/${entry}`);
                if (stat.uid === uid) {
                    count++;
                }
            } catch (e) {}
        }
    } catch (e) {}
    return count;
}

function runProbe() {
    try {
        const probeOut = execFileSync('/usr/local/bin/probe', [], {
            encoding: 'utf-8',
            timeout: 5000,
            env: { ...process.env, SANDBOX_UID: String(SANDBOX_UID) }
        });
        const parsed = JSON.parse(probeOut.trim());
        return {
            setrlimit: parsed.setrlimit || { ok: false, errno: -1 },
            setuid: parsed.setuid || { ok: false, errno: -1 },
            seccomp_load: parsed.seccomp_load || { ok: false, errno: -1 },
            fork_test: parsed.fork_test || { ok: false, forked: 0, errno: -1 }
        };
    } catch (e) {
        return {
            setrlimit: { ok: false, errno: -1, error: e.message },
            setuid: { ok: false, errno: -1, error: e.message },
            seccomp_load: { ok: false, errno: -1, error: e.message },
            fork_test: { ok: false, forked: 0, errno: -1, error: e.message }
        };
    }
}

function measureBitsStdCppCompileTime() {
    const probeSrc = `/tmp/probe_bits_stdcxx_${Date.now()}.cpp`;
    const probeBin = `/tmp/probe_bits_stdcxx_${Date.now()}.bin`;
    try {
        fs.writeFileSync(probeSrc, '#include <bits/stdc++.h>\nint main(){ std::cout << "ok\\n"; return 0; }\n', 'utf-8');
        const start = performance.now();
        execFileSync('/usr/bin/g++', ['-std=c++17', '-O2', probeSrc, '-o', probeBin], {
            timeout: 60000,
            encoding: 'utf-8'
        });
        const durationMs = Math.round(performance.now() - start);
        return durationMs;
    } catch (err) {
        console.error('Lỗi khi biên dịch probe bits/stdc++.h:', err.message);
        return -1;
    } finally {
        try { fs.unlinkSync(probeSrc); } catch (e) {}
        try { fs.unlinkSync(probeBin); } catch (e) {}
    }
}

function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

const server = http.createServer((req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;
        const method = req.method;

        if (method === 'GET' && pathname === '/health') {
            return sendJson(res, 200, {
                status: 'ok',
                uptimeMs: Date.now() - startTime
            });
        }

        if (pathname === '/env-probe' || pathname === '/run-suite' || pathname === '/bench') {
            const auth = verifySecret(req);
            if (!auth.ok) {
                return sendJson(res, auth.status, { error: auth.message });
            }
        } else {
            return sendJson(res, 404, { error: 'Not found' });
        }

        if (method === 'GET' && pathname === '/env-probe') {
            let uname = 'unknown';
            try {
                uname = execFileSync('uname', ['-a'], { encoding: 'utf-8' }).trim();
            } catch (e) {}

            const procStatus = getProcSelfStatus();
            const probeResult = runProbe();
            const cgroupLimit = getCgroupMemoryLimit();
            const sandboxProcCount = getSandboxProcessCount(SANDBOX_UID);
            const compileBitsMs = measureBitsStdCppCompileTime();

            const data = {
                uname,
                "uname -a": uname,
                cpus: os.cpus().length,
                totalRam: os.totalmem(),
                cgroupMemoryLimit: cgroupLimit,
                uid: typeof process.getuid === 'function' ? process.getuid() : 0,
                gid: typeof process.getgid === 'function' ? process.getgid() : 0,
                sandboxUid: SANDBOX_UID,
                sandboxProcCount,
                sandboxProcessesCount: sandboxProcCount,
                compile_bits_stdcxx_ms: compileBitsMs,
                compileBitsStdcxxMs: compileBitsMs,
                compileTimeMs: compileBitsMs,
                Seccomp: procStatus.Seccomp || 'unknown',
                NoNewPrivs: procStatus.NoNewPrivs || 'unknown',
                CapEff: procStatus.CapEff || 'unknown',
                procStatus,
                launcherProbe: probeResult,
                setuid: probeResult.setuid,
                setrlimit: probeResult.setrlimit,
                seccomp_load: probeResult.seccomp_load,
                fork_test: probeResult.fork_test,
                forkTest: probeResult.fork_test
            };
            return sendJson(res, 200, data);
        }

        if (method === 'POST' && pathname === '/run-suite') {
            if (isTaskRunning) {
                return sendJson(res, 409, { error: `Task '${runningTaskName}' is already running` });
            }
            isTaskRunning = true;
            runningTaskName = 'run-suite';

            const taskStart = performance.now();
            const child = spawn('node', ['run-suite.mjs'], { cwd: '/app' });

            let stdoutBuf = '';
            let stderrBuf = '';

            child.stdout.on('data', chunk => {
                stdoutBuf += chunk.toString();
            });
            child.stderr.on('data', chunk => {
                stderrBuf += chunk.toString();
            });

            // Hard timeout for suite (default 10 minutes)
            const suiteTimeoutMs = parseInt(process.env.SUITE_TIMEOUT_MS || '600000', 10);
            const timer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch (e) {}
            }, suiteTimeoutMs);

            child.on('close', code => {
                clearTimeout(timer);
                isTaskRunning = false;
                runningTaskName = null;

                const durationMs = Math.round(performance.now() - taskStart);
                const fullOutput = stdoutBuf + (stderrBuf ? '\n--- STDERR ---\n' + stderrBuf : '');

                const passMatch = fullOutput.match(/Số ca ĐẠT \(PASS\)\s*:\s*(\d+)/);
                const failMatch = fullOutput.match(/Số ca THẤT BẠI \(FAIL\)\s*:\s*(\d+)/);
                const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
                const failed = failMatch ? parseInt(failMatch[1], 10) : (code === 0 ? 0 : 1);

                let outputTail = fullOutput;
                const maxBytes = 64 * 1024;
                const buf = Buffer.from(outputTail, 'utf-8');
                if (buf.length > maxBytes) {
                    outputTail = buf.subarray(buf.length - maxBytes).toString('utf-8');
                }

                return sendJson(res, 200, {
                    exitCode: code !== null ? code : -1,
                    durationMs,
                    passed,
                    failed,
                    outputTail
                });
            });
            return;
        }

        if (method === 'POST' && pathname === '/bench') {
            if (isTaskRunning) {
                return sendJson(res, 409, { error: `Task '${runningTaskName}' is already running` });
            }
            isTaskRunning = true;
            runningTaskName = 'bench';

            const taskStart = performance.now();
            const child = spawn('node', ['bench.mjs'], { cwd: '/app' });

            let stdoutBuf = '';
            let stderrBuf = '';

            child.stdout.on('data', chunk => {
                stdoutBuf += chunk.toString();
            });
            child.stderr.on('data', chunk => {
                stderrBuf += chunk.toString();
            });

            // Hard timeout 5 minutes
            const timer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch (e) {}
            }, 5 * 60 * 1000);

            child.on('close', code => {
                clearTimeout(timer);
                isTaskRunning = false;
                runningTaskName = null;

                const durationMs = Math.round(performance.now() - taskStart);
                const fullOutput = stdoutBuf + (stderrBuf ? '\n--- STDERR ---\n' + stderrBuf : '');

                let outputTail = fullOutput;
                const maxBytes = 64 * 1024;
                const buf = Buffer.from(outputTail, 'utf-8');
                if (buf.length > maxBytes) {
                    outputTail = buf.subarray(buf.length - maxBytes).toString('utf-8');
                }

                return sendJson(res, 200, {
                    exitCode: code !== null ? code : -1,
                    durationMs,
                    outputTail
                });
            });
            return;
        }

        return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
        return sendJson(res, 500, { error: err.message });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    const actualPort = server.address().port;
    console.log(`SPIKE_SERVER_LISTENING:port=${actualPort}`);
});
