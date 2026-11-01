import pg from 'pg';
import { buildApp } from './app.js';
import { ApiConfig, buildConfig } from './config.js';

let cfg: ApiConfig;
try {
  cfg = buildConfig();
} catch (err: any) {
  console.error('Lỗi cấu hình khởi động API:', err.message);
  process.exit(1);
}

const connectionString = cfg.databaseUrl;
const pool = connectionString ? new pg.Pool({ connectionString, max: 5 }) : undefined;
const app = buildApp({ pool, config: cfg });

async function start() {
  try {
    await app.listen({ port: cfg.port, host: cfg.host });
    console.log(`API server listening on ${cfg.host}:${cfg.port}`);
  } catch (err) {
    console.error('Failed to start API server:', err);
    process.exit(1);
  }
}

start();
