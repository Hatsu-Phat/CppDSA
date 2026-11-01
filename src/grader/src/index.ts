import { buildGraderApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildGraderApp(config);

async function start() {
  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Grader service listening on ${config.host}:${config.port}`);
  } catch (err) {
    console.error('Failed to start Grader service:', err);
    process.exit(1);
  }
}

start();
