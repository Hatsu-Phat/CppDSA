export interface GraderConfig {
  port: number;
  host: string;
  graderSecret: string;
  concurrency: number;
  memoryBudgetMb: number;
  sandboxUidBase: number;
  sandboxUidStart: number;
  sandboxUidCount: number;
  launcherPath: string;
  compileTimeoutMs: number;
  maxOutputBytes: number;
}

export function loadConfig(): GraderConfig {
  const port = Number(process.env.PORT || process.env.GRADER_PORT || 4100);
  const host = process.env.HOST || process.env.GRADER_HOST || '0.0.0.0';
  const graderSecret = process.env.GRADER_SECRET || '';
  const concurrency = Math.max(1, Number(process.env.GRADER_CONCURRENCY || 2));
  const memoryBudgetMb = Math.max(1, Number(process.env.GRADER_MEMORY_BUDGET_MB || 400));
  const sandboxUidBase = Number(
    process.env.SANDBOX_UID_BASE || process.env.SANDBOX_UID_START || 2000000000
  );
  const sandboxUidCount = Number(process.env.SANDBOX_UID_COUNT || 8);
  const launcherPath = process.env.LAUNCHER_PATH || '/usr/local/bin/launcher';
  const compileTimeoutMs = Number(process.env.COMPILE_TIMEOUT_MS || 10000);
  const maxOutputBytes = Number(process.env.MAX_OUTPUT_BYTES || 256 * 1024); // 256 KB

  return {
    port,
    host,
    graderSecret,
    concurrency,
    memoryBudgetMb,
    sandboxUidBase,
    sandboxUidStart: sandboxUidBase,
    sandboxUidCount,
    launcherPath,
    compileTimeoutMs,
    maxOutputBytes,
  };
}
