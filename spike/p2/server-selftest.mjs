import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

function request(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk.toString());
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (e) {}
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    raw: data,
                    json
                });
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

function startServer(extraEnv = {}) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, PORT: '0', ...extraEnv };
        const child = spawn('node', ['server.mjs'], {
            cwd: '/app',
            env
        });

        let port = null;
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', chunk => {
            const str = chunk.toString();
            stdout += str;
            const match = str.match(/SPIKE_SERVER_LISTENING:port=(\d+)/);
            if (match && !port) {
                port = parseInt(match[1], 10);
                resolve({ child, port });
            }
        });

        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });

        child.on('error', reject);
        child.on('close', code => {
            if (!port) {
                reject(new Error(`Server closed with code ${code} before listening. Output: ${stderr || stdout}`));
            }
        });

        setTimeout(() => {
            if (!port) {
                child.kill('SIGKILL');
                reject(new Error(`Server timeout waiting to listen. Output: ${stdout} ${stderr}`));
            }
        }, 10000);
    });
}

async function runSelftest() {
    console.log('============================================================');
    console.log('         CPPDSA P2 SPIKE - SERVER SELFTEST                   ');
    console.log('============================================================\n');

    const results = [];
    function report(name, passed, detail = '') {
        const status = passed ? 'PASS' : 'FAIL';
        results.push({ name, passed });
        console.log(`[${status}] ${name}${detail ? ' - ' + detail : ''}`);
    }

    // Phase 1: Test server behavior when SPIKE_SECRET is not configured
    console.log('--- PHẦN 1: Kiểm tra khi KHÔNG đặt SPIKE_SECRET ---');
    const s1 = await startServer({ SPIKE_SECRET: '' });
    try {
        const resProbe = await request({ hostname: '127.0.0.1', port: s1.port, path: '/env-probe', method: 'GET' });
        const resSuite = await request({ hostname: '127.0.0.1', port: s1.port, path: '/run-suite', method: 'POST' });
        const resBench = await request({ hostname: '127.0.0.1', port: s1.port, path: '/bench', method: 'POST' });

        const unconfigOk = resProbe.status === 503 && resSuite.status === 503 && resBench.status === 503;
        report('khi không đặt SPIKE_SECRET → mọi endpoint có secret trả 503', unconfigOk,
            `probe=${resProbe.status}, suite=${resSuite.status}, bench=${resBench.status}`);
    } finally {
        s1.child.kill('SIGTERM');
        await new Promise(r => setTimeout(r, 200));
    }

    // Phase 2: Test server with temporary random secret
    console.log('\n--- PHẦN 2: Kiểm tra khi đặt SPIKE_SECRET ngẫu nhiên ---');
    const testSecret = crypto.randomBytes(24).toString('hex');
    const s2 = await startServer({ SPIKE_SECRET: testSecret });

    try {
        // 1. /health 200
        const resHealth = await request({ hostname: '127.0.0.1', port: s2.port, path: '/health', method: 'GET' });
        const healthOk = resHealth.status === 200 && resHealth.json?.status === 'ok' && typeof resHealth.json?.uptimeMs === 'number';
        report('/health 200', healthOk, `status=${resHealth.status}, uptimeMs=${resHealth.json?.uptimeMs}`);

        // 2. /env-probe không secret → 401
        const resProbeNoSecret = await request({ hostname: '127.0.0.1', port: s2.port, path: '/env-probe', method: 'GET' });
        report('/env-probe không secret → 401', resProbeNoSecret.status === 401, `status=${resProbeNoSecret.status}`);

        // 3. /env-probe sai secret → 401
        const resProbeWrongSecret = await request({
            hostname: '127.0.0.1',
            port: s2.port,
            path: '/env-probe',
            method: 'GET',
            headers: { 'X-Spike-Secret': 'wrong_invalid_secret_value' }
        });
        report('/env-probe sai secret → 401', resProbeWrongSecret.status === 401, `status=${resProbeWrongSecret.status}`);

        // 4. /env-probe đúng → 200 và có các trường trên
        const resProbeValid = await request({
            hostname: '127.0.0.1',
            port: s2.port,
            path: '/env-probe',
            method: 'GET',
            headers: { 'X-Spike-Secret': testSecret }
        });
        const p = resProbeValid.json || {};
        const probeFieldsOk = resProbeValid.status === 200 &&
            typeof p.uname === 'string' && p.uname.length > 0 &&
            typeof p.cpus === 'number' && p.cpus > 0 &&
            typeof p.totalRam === 'number' && p.totalRam > 0 &&
            'cgroupMemoryLimit' in p &&
            typeof p.uid === 'number' &&
            typeof p.gid === 'number' &&
            typeof p.sandboxProcessesCount === 'number' &&
            typeof p.compile_bits_stdcxx_ms === 'number' && p.compile_bits_stdcxx_ms > 0 &&
            p.procStatus && typeof p.procStatus.Seccomp !== 'undefined' &&
            p.procStatus && typeof p.procStatus.NoNewPrivs !== 'undefined' &&
            p.procStatus && typeof p.procStatus.CapEff !== 'undefined' &&
            p.launcherProbe?.setuid?.ok === true &&
            p.launcherProbe?.setrlimit?.ok === true &&
            p.launcherProbe?.seccomp_load?.ok === true &&
            p.launcherProbe?.fork_test?.ok === true &&
            p.launcherProbe?.fork_test?.forked === 5;

        report('/env-probe đúng → 200 và có các trường trên', probeFieldsOk,
            `status=${resProbeValid.status}, cpus=${p.cpus}, uid=${p.uid}, compile_bits_ms=${p.compile_bits_stdcxx_ms}, seccomp=${p.procStatus?.Seccomp}, setuid_ok=${p.launcherProbe?.setuid?.ok}, setrlimit_ok=${p.launcherProbe?.setrlimit?.ok}, seccomp_load_ok=${p.launcherProbe?.seccomp_load?.ok}, fork_test_ok=${p.launcherProbe?.fork_test?.ok}, sandbox_procs=${p.sandboxProcessesCount}`);

        // 5. Concurrency check: gọi đồng thời 2 lần → một lần 409
        console.log('\n--- PHẦN 3: Kiểm tra khóa đồng thời và thực thi /run-suite ---');
        const req1Promise = request({
            hostname: '127.0.0.1',
            port: s2.port,
            path: '/run-suite',
            method: 'POST',
            headers: { 'X-Spike-Secret': testSecret }
        });

        // Delay ngắn để req1 đã bắt đầu tiến trình chạy trong runner
        await new Promise(r => setTimeout(r, 150));

        const req2Promise = request({
            hostname: '127.0.0.1',
            port: s2.port,
            path: '/run-suite',
            method: 'POST',
            headers: { 'X-Spike-Secret': testSecret }
        });

        const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

        const has409 = (res1.status === 409 || res2.status === 409);
        report('gọi đồng thời 2 lần → một lần 409', has409, `res1=${res1.status}, res2=${res2.status}`);

        // 6. /run-suite đúng secret → exitCode 0 và failed 0
        const suiteRes = (res1.status === 200) ? res1 : ((res2.status === 200) ? res2 : null);
        const suiteOk = suiteRes && suiteRes.json &&
            suiteRes.json.exitCode === 0 &&
            suiteRes.json.failed === 0 &&
            suiteRes.json.passed === 38;

        report('/run-suite đúng secret → exitCode 0 và failed 0', suiteOk,
            `exitCode=${suiteRes?.json?.exitCode}, passed=${suiteRes?.json?.passed}, failed=${suiteRes?.json?.failed}, durationMs=${suiteRes?.json?.durationMs}`);

        // 7. /bench → exitCode 0
        console.log('\n--- PHẦN 4: Kiểm tra /bench ---');
        const resBench = await request({
            hostname: '127.0.0.1',
            port: s2.port,
            path: '/bench',
            method: 'POST',
            headers: { 'X-Spike-Secret': testSecret }
        });
        const benchOk = resBench.status === 200 &&
            resBench.json?.exitCode === 0 &&
            resBench.json?.durationMs > 0;

        report('/bench → exitCode 0', benchOk,
            `status=${resBench.status}, exitCode=${resBench.json?.exitCode}, durationMs=${resBench.json?.durationMs}`);

    } finally {
        s2.child.kill('SIGTERM');
        await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n============================================================');
    const passedCount = results.filter(r => r.passed).length;
    console.log(`TỔNG KẾT: ${passedCount}/${results.length} tiêu chí ĐẠT.`);
    console.log('============================================================');

    if (passedCount === results.length) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runSelftest().catch(err => {
    console.error('Fatal selftest error:', err);
    process.exit(1);
});
