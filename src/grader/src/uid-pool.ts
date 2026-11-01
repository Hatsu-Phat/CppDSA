import fs from 'node:fs';

export class UidPool {
  private availableUids: number[] = [];
  private waitingResolvers: ((uid: number) => void)[] = [];

  constructor(startUid = 10001, count = 8) {
    for (let i = 0; i < count; i++) {
      this.availableUids.push(startUid + i);
    }
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
    const nextResolver = this.waitingResolvers.shift();
    if (nextResolver) {
      nextResolver(uid);
    } else {
      this.availableUids.push(uid);
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
