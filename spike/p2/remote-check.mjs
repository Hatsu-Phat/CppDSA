import { performance } from 'node:perf_hooks';

function printUsage() {
    console.error('Usage: node remote-check.mjs <baseUrl> [--health-only]');
    console.error('Example: SPIKE_SECRET=mysecret node remote-check.mjs https://cppdsa-spike.onrender.com');
}

async function main() {
    const rawArgs = process.argv.slice(2);
    let baseUrl = null;
    let healthOnly = false;

    for (const arg of rawArgs) {
        if (arg === '--health-only') {
            healthOnly = true;
        } else if (!arg.startsWith('--')) {
            baseUrl = arg;
        }
    }

    if (!baseUrl) {
        printUsage();
        process.exit(1);
    }

    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = 'http://' + baseUrl;
    }
    baseUrl = baseUrl.replace(/\/+$/, '');

    const secret = process.env.SPIKE_SECRET || '';
    if (!healthOnly && !secret) {
        console.error('Warning: SPIKE_SECRET environment variable is not set. Protected endpoints will return 401 or 503.');
    }

    // 1. Measure cold start with first GET /health
    const healthStart = performance.now();
    let healthRes, healthJson;
    try {
        healthRes = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(120000) });
        healthJson = await healthRes.json();
    } catch (err) {
        console.error(`Failed to reach ${baseUrl}/health:`, err.message);
        process.exit(1);
    }
    const coldStartMs = Math.round(performance.now() - healthStart);

    if (healthOnly) {
        const output = {
            baseUrl,
            coldStartMs,
            coldStartNote: 'Thời gian đo tính từ lúc client bắt đầu gửi HTTP request GET /health đến khi nhận phản hồi đầy đủ',
            health: {
                status: healthRes.status,
                data: healthJson
            }
        };
        console.log(JSON.stringify(output, null, 2));
        process.exit(healthRes.status === 200 ? 0 : 1);
    }

    // 2. GET /env-probe
    let probeRes, probeJson;
    try {
        probeRes = await fetch(`${baseUrl}/env-probe`, {
            headers: { 'X-Spike-Secret': secret },
            signal: AbortSignal.timeout(30000)
        });
        probeJson = await probeRes.json();
    } catch (err) {
        probeRes = { status: 0 };
        probeJson = { error: err.message };
    }

    // 3. POST /run-suite (can take up to a few minutes)
    let suiteRes, suiteJson;
    try {
        suiteRes = await fetch(`${baseUrl}/run-suite`, {
            method: 'POST',
            headers: { 'X-Spike-Secret': secret },
            signal: AbortSignal.timeout(360000)
        });
        suiteJson = await suiteRes.json();
    } catch (err) {
        suiteRes = { status: 0 };
        suiteJson = { error: err.message };
    }

    // 4. POST /bench
    let benchRes, benchJson;
    try {
        benchRes = await fetch(`${baseUrl}/bench`, {
            method: 'POST',
            headers: { 'X-Spike-Secret': secret },
            signal: AbortSignal.timeout(120000)
        });
        benchJson = await benchRes.json();
    } catch (err) {
        benchRes = { status: 0 };
        benchJson = { error: err.message };
    }

    const summary = {
        baseUrl,
        coldStartMs,
        coldStartNote: 'Thời gian đo tính từ lúc client bắt đầu gửi HTTP request GET /health đến khi nhận phản hồi đầy đủ',
        health: {
            status: healthRes.status,
            data: healthJson
        },
        envProbe: {
            status: probeRes.status,
            data: probeJson
        },
        runSuite: {
            status: suiteRes.status,
            data: suiteJson
        },
        bench: {
            status: benchRes.status,
            data: benchJson
        }
    };

    console.log(JSON.stringify(summary, null, 2));

    const allOk = healthRes.status === 200 &&
        probeRes.status === 200 &&
        suiteRes.status === 200 && suiteJson?.exitCode === 0 &&
        benchRes.status === 200 && benchJson?.exitCode === 0;

    process.exit(allOk ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal remote-check error:', err);
    process.exit(1);
});
