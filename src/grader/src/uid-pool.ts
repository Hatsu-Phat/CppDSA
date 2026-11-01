import fs from 'node:fs';
import { execSync } from 'node:child_process';

export class UidPool {
  private availableUids: number[] = [];
  private waitingResolvers: ((uid: number) => void)[] = [];
  private baseUid: number;
  private count: number;

  constructor(startUid = 2000000000, count = 8) {
    this.baseUid = startUid;
    this.count = count;
    for (let i = 0; i < count; i++) {
      const uid = startUid + i;
      this.availableUids.push(uid);
      if (
        process.platform === 'linux' &&
        typeof process.getuid === 'function' &&
        process.getuid() === 0
      ) {
        try {
          execSync(
            `id -u ${uid} >/dev/null 2>&1 || (groupadd -g ${uid} sandbox${uid} 2>/dev/null && useradd -u ${uid} -g ${uid} -M -d /nonexistent -s /usr/sbin/nologin sandbox${uid} 2>/dev/null)`,
            { stdio: 'ignore' }
          );
        } catch {
          // Ignore
        }
      }
    }
  }

  public getBaseUid(): number {
    return this.baseUid;
  }

  public getCount(): number {
    return this.count;
  }

  public async acquire(): Promise<number> {
    const uid = this.availableUids.shift();
    if (uid !== undefined) {
      return uid;
    }
    return new Promise<number>((resolve) => {
      this.waitingResolvers.push(resolve);
    });
  }

  public release(uid: number): void {
    this.killProcessesByUid(uid);
    this.cleanSandboxFiles(uid);
    const nextResolver = this.waitingResolvers.shift();
    if (nextResolver) {
      nextResolver(uid);
    } else {
      this.availableUids.push(uid);
    }
  }

  public cleanSandboxFiles(uid: number): void {
    if (uid <= 0) return;
    const searchDirs = ['/dev/shm', '/tmp', '/var/tmp'];
    for (const dir of searchDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = `${dir}/${entry}`;
          try {
            const stat = fs.lstatSync(fullPath);
            if (stat.uid === uid) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            }
          } catch {
            // Ignore
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  public killProcessesByUid(uid: number): void {
    if (uid <= 0) return;
    try {
      if (!fs.existsSync('/proc')) return;
      for (let iter = 0; iter < 4; iter++) {
        let found = false;
        const entries = fs.readdirSync('/proc');
        for (const entry of entries) {
          if (!/^\d+$/.test(entry)) continue;
          const pid = parseInt(entry, 10);
          if (pid <= 1 || pid === process.pid) continue;
          try {
            const stat = fs.statSync(`/proc/${pid}`);
            if (stat.uid === uid) {
              found = true;
              process.kill(pid, 'SIGKILL');
            }
          } catch {
            // Process may have already exited
          }
        }
        if (!found) break;
      }
    } catch {
      // In non-Linux or test environment where /proc is unavailable
    }
  }
}
