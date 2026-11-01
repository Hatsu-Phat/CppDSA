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
  private uidPool: UidPool;
  private config: GraderConfig;

  constructor(config: GraderConfig, uidPool?: UidPool) {
    this.config = config;
    this.uidPool = uidPool || new UidPool(config.sandboxUidStart, config.sandboxUidCount);
  }

  public enqueue(job: JudgeJob): void {
    this.queue.push({
      job,
      enqueuedAt: Date.now(),
    });
    this.processNext();
  }

  public getStats(): { queueLength: number; activeJobs: number } {
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeCount,
    };
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.config.concurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;

    // Execute job asynchronously
    (async () => {
      let result: JudgeResult;
      try {
        result = await executeJob(item.job, this.uidPool, this.config);
      } catch (err: any) {
        result = {
          submissionId: item.job.submissionId,
          status: 'SYSTEM_ERROR',
          verdict: 'SE',
          score: 0,
          tests: [],
          compileMessage: `System error: ${err.message || 'Unknown error'}`,
        };
      }

      // Send callback
      await this.sendCallbackWithRetry(item.job.callbackUrl, result);

      this.activeCount--;
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
