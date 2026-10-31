import pg from 'pg';
import { buildApp } from './app.js';

const port = Number(process.env.PORT || process.env.API_PORT || 4000);
const host = process.env.HOST || process.env.API_HOST || '0.0.0.0';
const connectionString = process.env.DATABASE_URL;

const pool = connectionString ? new pg.Pool({ connectionString, max: 5 }) : undefined;

const app = buildApp({ pool });

async function start() {
  try {
    await app.listen({ port, host });
    console.log(`API server listening on ${host}:${port}`);
  } catch (err) {
    console.error('Failed to start API server:', err);
    process.exit(1);
  }
}

start();
