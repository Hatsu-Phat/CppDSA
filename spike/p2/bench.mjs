import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const WORK_DIR = '/tmp/bench_run';
const BIN_PATH = '/tmp/bench_bin';
const SRC_PATH = '/app/bench.cpp';

console.log('=== P2 BENCHMARK: CPU-bound 10 Runs ===');

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
fs.chownSync(WORK_DIR, 10001, 10001);

const runs = 10;
const times = [];

console.log('Bắt đầu đo 10 lần chạy trong sandbox:');
for (let i = 1; i <= runs; i++) {
    const start = performance.now();
    const res = spawnSync('/usr/local/bin/launcher', [
        '--workdir', WORK_DIR,
        '--uid', '10001',
        '--gid', '10001',
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

    times.push(duration);
    console.log(`  Lần ${String(i).padStart(2, ' ')}: ${duration} ms (output: ${res.stdout.trim()})`);
}

// Thống kê
const sum = times.reduce((a, b) => a + b, 0);
const mean = sum / runs;
const variance = times.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / runs;
const stdDev = Math.sqrt(variance);
const min = Math.min(...times);
const max = Math.max(...times);
const spreadPct = ((max - min) / mean) * 100;
const stdDevPct = (stdDev / mean) * 100;

console.log('--------------------------------------------------');
console.log(`Số lần chạy        : ${runs}`);
console.log(`Min                : ${min} ms`);
console.log(`Max                : ${max} ms`);
console.log(`Mean (Trung bình)  : ${mean.toFixed(2)} ms`);
console.log(`StdDev (Độ lệch)   : ${stdDev.toFixed(2)} ms (${stdDevPct.toFixed(2)}%)`);
console.log(`(Max - Min) / Mean : ${spreadPct.toFixed(2)}%`);
console.log('--------------------------------------------------');

// Dọn dẹp
try {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
    fs.rmSync(BIN_PATH, { force: true });
} catch (e) {}

process.exit(0);
