import fs from 'node:fs';
import { JudgeJob } from '@cppdsa/shared';
import { UidPool } from './uid-pool.js';
import { GraderConfig } from './config.js';
import { executeJob, ExecuteJobResult } from './executor.js';

interface QueuedItem {
  job: JudgeJob;
  enqueuedAt: number;
}

export class JobQueue {
  private queue: QueuedItem[] = [];
  private activeCount = 0;
  private activeMemoryMb = 0;
  private uidPool: UidPool;
  private config: GraderConfig;
  private cgroupTimer: NodeJS.Timeout | null = null;
  private recentMetrics = new Map<
    string,
    { queueMs: number; compileMs: number; runMs: number; totalMs: number }
  >();

  constructor(config: GraderConfig, uidPool?: UidPool) {
    this.config = config;
    this.uidPool = uidPool || new UidPool(config.sandboxUidBase, config.sandboxUidCount);

    if (this.config.enableCgroupLogging) {
      this.startCgroupLogging();
    }
  }

  public enqueue(job: JudgeJob): void {
    this.queue.push({
      job,
      enqueuedAt: Date.now(),
    });
    this.processNext();
  }

  public getStats(): {
    queueLength: number;
    activeJobs: number;
    activeMemoryMb: number;
    memoryBudgetMb: number;
  } {
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeCount,
      activeMemoryMb: this.activeMemoryMb,
      memoryBudgetMb: this.config.memoryBudgetMb,
    };
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    if (this.activeCount >= this.config.concurrency) {
      return;
    }

    const nextItem = this.queue[0];
    const jobMem = nextItem.job.memoryLimitMb;

    if (this.activeCount > 0 && this.activeMemoryMb + jobMem > this.config.memoryBudgetMb) {
      // Exceeds memory budget while jobs are active; wait for in-flight jobs to finish
      return;
    }

    this.queue.shift();
    this.activeCount++;
    this.activeMemoryMb += jobMem;

    // Execute job asynchronously
    (async () => {
      const startExecuteAt = Date.now();
      let result: ExecuteJobResult;
      try {
        result = await executeJob(nextItem.job, this.uidPool, this.config);
      } catch (err: any) {
        result = {
          submissionId: nextItem.job.submissionId,
          status: 'SYSTEM_ERROR',
          verdict: 'SE',
          score: 0,
          tests: [],
          compileMessage: `System error: ${err.message || 'Unknown error'}`,
          compileMs: 0,
          runMs: 0,
        };
      }

      // Structured JSON logging: decision 6
      const queueMs = Math.max(0, Math.round(startExecuteAt - nextItem.enqueuedAt));
      const compileMs = result.compileMs ?? 0;
      const runMs = result.runMs ?? 0;
      const totalMs = Math.round(Date.now() - nextItem.enqueuedAt);
      const logEntry = {
        level: 'info',
        time: new Date().toISOString(),
        service: 'grader',
        jobId: nextItem.job.submissionId,
        submissionId: nextItem.job.submissionId,
        queuedAt: nextItem.enqueuedAt,
        queueMs,
        compileMs,
        runMs,
        totalMs,
        verdict: result.verdict,
        score: result.score,
      };
      console.log(JSON.stringify(logEntry));

      this.recentMetrics.set(nextItem.job.submissionId, {
        queueMs,
        compileMs,
        runMs,
        totalMs,
      });

      // Send callback
      await this.sendCallbackWithRetry(nextItem.job.callbackUrl, result);

      this.activeCount--;
      this.activeMemoryMb -= jobMem;
      this.processNext();
    })();
  }

  public getJobMetrics(submissionId: string):
    | {
        queueMs: number;
        compileMs: number;
        runMs: number;
        totalMs: number;
      }
    | undefined {
    return this.recentMetrics.get(submissionId);
  }

  private async sendCallbackWithRetry(
    callbackUrl: string,
    result: ExecuteJobResult,
    maxRetries = 3
  ): Promise<void> {
    if (!callbackUrl) return;

    let delayMs = 50;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Grader-Secret': this.config.graderSecret,
          },
          body: JSON.stringify(result),
        });

        if (response.ok) {
          return;
        }
      } catch {
        // Network or server error on callback
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 3;
      }
    }
  }

  private startCgroupLogging(): void {
    this.cgroupTimer = setInterval(() => {
      try {
        let cpuStat = '';
        let memCurrent = '';
        let memPeak = '';
        if (fs.existsSync('/sys/fs/cgroup/cpu.stat')) {
          cpuStat = fs.readFileSync('/sys/fs/cgroup/cpu.stat', 'utf-8').trim();
        }
        if (fs.existsSync('/sys/fs/cgroup/memory.current')) {
          memCurrent = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf-8').trim();
        }
        if (fs.existsSync('/sys/fs/cgroup/memory.peak')) {
          memPeak = fs.readFileSync('/sys/fs/cgroup/memory.peak', 'utf-8').trim();
        }
        console.log(
          JSON.stringify({
            level: 'info',
            time: new Date().toISOString(),
            service: 'grader-cgroup',
            cpuStat,
            memoryCurrentBytes: Number(memCurrent) || null,
            memoryPeakBytes: Number(memPeak) || null,
          })
        );
      } catch {
        // Ignore
      }
    }, 10000);
  }

  public stop(): void {
    if (this.cgroupTimer) {
      clearInterval(this.cgroupTimer);
      this.cgroupTimer = null;
    }
  }
}
