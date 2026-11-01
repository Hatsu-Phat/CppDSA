import { spawnSync, execSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const WORK_DIR = '/tmp/bench_run';
const BIN_PATH = '/tmp/bench_bin';
const SRC_PATH = '/app/bench.cpp';
const SANDBOX_UID = parseInt(process.env.SANDBOX_UID || '2000000000', 10);

let nprocVal = 'unknown';
try {
    nprocVal = execSync('nproc', { encoding: 'utf-8' }).trim();
} catch (e) {
    nprocVal = String(os.cpus().length);
}
const cpuCount = os.cpus().length;

console.log('=== P2 BENCHMARK: CPU-bound 10 Runs ===');
console.log(`Cấu hình hệ thống: nproc=${nprocVal}, os.cpus().length=${cpuCount}, SANDBOX_UID=${SANDBOX_UID}`);

// 1. Biên dịch bench.cpp
console.log('Biên dịch bench.cpp với g++ -std=c++17 -O2...');
const compileRes = spawnSync('g++ -std=c++17 -O2 ' + SRC_PATH + ' -o ' + BIN_PATH, {
    shell: true,
    encoding: 'utf-8'
});

if (compileRes.status !== 0) {
    console.error('Lỗi biên dịch bench.cpp:', compileRes.stderr);
    process.exit(1);
}

fs.chmodSync(BIN_PATH, 0o755);

// Chuẩn bị thư mục chạy
if (fs.existsSync(WORK_DIR)) {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
}
fs.mkdirSync(WORK_DIR, { recursive: true });
fs.chmodSync(WORK_DIR, 0o700);
fs.chownSync(WORK_DIR, SANDBOX_UID, SANDBOX_UID);

const runs = 10;
const times = [];
const cpuTimes = [];

console.log('Bắt đầu đo 10 lần chạy trong sandbox:');
for (let i = 1; i <= runs; i++) {
    const start = performance.now();
    const res = spawnSync('/usr/local/bin/launcher', [
        '--workdir', WORK_DIR,
        '--uid', String(SANDBOX_UID),
        '--gid', String(SANDBOX_UID),
        '--tl-sec', '5',
        '--ml-bytes', '268435456',
        '--fsize-bytes', '10485760',
        '--nproc', '20',
        '--seccomp',
        '--',
        BIN_PATH
    ], {
        encoding: 'utf-8'
    });
    const duration = Math.round(performance.now() - start);

    if (res.status !== 0) {
        console.error(`Lỗi khi chạy lần ${i}: status=${res.status}, stderr=${res.stderr}`);
        process.exit(1);
    }

    let userTimeMs = 0;
    let sysTimeMs = 0;
    let cpuTimeMs = 0;
    const rusagePath = path.join(WORK_DIR, 'rusage.json');
    if (fs.existsSync(rusagePath)) {
        try {
            const rusage = JSON.parse(fs.readFileSync(rusagePath, 'utf-8'));
            userTimeMs = rusage.user_time_ms || 0;
            sysTimeMs = rusage.sys_time_ms || 0;
            cpuTimeMs = userTimeMs + sysTimeMs;
        } catch (e) {}
    }

    times.push(duration);
    cpuTimes.push(cpuTimeMs);
    const ratio = (cpuTimeMs / (duration || 1)).toFixed(2);
    console.log(`  Lần ${String(i).padStart(2, ' ')}: wall=${String(duration).padStart(5, ' ')} ms | CPU=${String(cpuTimeMs).padStart(5, ' ')} ms (user=${userTimeMs} ms, sys=${sysTimeMs} ms) | ratio=${ratio} (output: ${res.stdout.trim()})`);
}

// Thống kê wall time
const sum = times.reduce((a, b) => a + b, 0);
const mean = sum / runs;
const variance = times.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / runs;
const stdDev = Math.sqrt(variance);
const min = Math.min(...times);
const max = Math.max(...times);
const spreadPct = ((max - min) / mean) * 100;
const stdDevPct = (stdDev / mean) * 100;

// Thống kê cpu time
const cpuSum = cpuTimes.reduce((a, b) => a + b, 0);
const cpuMean = cpuSum / runs;
const cpuMin = Math.min(...cpuTimes);
const cpuMax = Math.max(...cpuTimes);
const throttleRatio = (cpuMean / (mean || 1)).toFixed(3);

console.log('--------------------------------------------------');
console.log(`Số lần chạy        : ${runs}`);
console.log(`Cấu hình hệ thống  : nproc=${nprocVal}, os.cpus().length=${cpuCount}`);
console.log(`Wall time - Min    : ${min} ms`);
console.log(`Wall time - Max    : ${max} ms`);
console.log(`Wall time - Mean   : ${mean.toFixed(2)} ms`);
console.log(`Wall time - StdDev : ${stdDev.toFixed(2)} ms (${stdDevPct.toFixed(2)}%)`);
console.log(`Wall time - Spread : ${spreadPct.toFixed(2)}%`);
console.log(`CPU time  - Min    : ${cpuMin} ms`);
console.log(`CPU time  - Max    : ${cpuMax} ms`);
console.log(`CPU time  - Mean   : ${cpuMean.toFixed(2)} ms`);
console.log(`CPU throttle ratio : ${throttleRatio} (CPU time / Wall time; ~1.0=full CPU, ~0.15=Render free throttled)`);
console.log('--------------------------------------------------');

// Dọn dẹp
try {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
    fs.rmSync(BIN_PATH, { force: true });
} catch (e) {}

process.exit(0);
