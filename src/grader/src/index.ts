import { buildGraderApp } from './app.js';

const port = Number(process.env.PORT || process.env.GRADER_PORT || 4100);
const host = process.env.HOST || process.env.GRADER_HOST || '0.0.0.0';

const app = buildGraderApp();

async function start() {
  try {
    await app.listen({ port, host });
    console.log(`Grader service listening on ${host}:${port}`);
  } catch (err) {
    console.error('Failed to start Grader service:', err);
    process.exit(1);
  }
}

start();
