import { JudgeJob, JudgeResult } from '@cppdsa/shared';
import { UidPool } from './uid-pool.js';
import { GraderConfig } from './config.js';
import { executeJob } from './executor.js';

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

  constructor(config: GraderConfig, uidPool?: UidPool) {
    this.config = config;
    this.uidPool = uidPool || new UidPool(config.sandboxUidBase, config.sandboxUidCount);
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
      let result: JudgeResult;
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
        };
      }

      // Send callback
      await this.sendCallbackWithRetry(nextItem.job.callbackUrl, result);

      this.activeCount--;
      this.activeMemoryMb -= jobMem;
      this.processNext();
    })();
  }

  private async sendCallbackWithRetry(
    callbackUrl: string,
    result: JudgeResult,
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
}
