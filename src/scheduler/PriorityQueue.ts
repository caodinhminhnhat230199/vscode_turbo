import { JobPriority, ScheduledJob } from './JobTypes';

export class PriorityQueue {
  // Buckets indexed by JobPriority enum (0 to 6)
  private buckets: Map<JobPriority, ScheduledJob[]> = new Map();
  private jobMap: Map<string, { job: ScheduledJob; priority: JobPriority }> = new Map();

  constructor() {
    this.initBuckets();
  }

  private initBuckets(): void {
    const priorities = [
      JobPriority.P0_INTERACTIVE_SEARCH,
      JobPriority.P1_NAVIGATION,
      JobPriority.P2_INCREMENTAL_INDEX,
      JobPriority.P3_USER_TRIGGERED_DIAGNOSTIC,
      JobPriority.P4_WARMUP,
      JobPriority.P5_BACKGROUND_INDEX,
      JobPriority.P6_MAINTENANCE,
    ];
    for (const p of priorities) {
      this.buckets.set(p, []);
    }
  }

  public enqueue<T>(job: ScheduledJob<T>): void {
    // If job with same ID already exists, remove it first
    if (this.jobMap.has(job.id)) {
      this.remove(job.id);
    }

    const untypedJob = job as ScheduledJob<unknown>;
    let bucket = this.buckets.get(job.priority);
    if (!bucket) {
      bucket = [];
      this.buckets.set(job.priority, bucket);
    }
    bucket.push(untypedJob);
    this.jobMap.set(job.id, { job: untypedJob, priority: job.priority });
  }

  public dequeue(ignoredPriorities?: Set<JobPriority>): ScheduledJob | undefined {
    const priorities = [
      JobPriority.P0_INTERACTIVE_SEARCH,
      JobPriority.P1_NAVIGATION,
      JobPriority.P2_INCREMENTAL_INDEX,
      JobPriority.P3_USER_TRIGGERED_DIAGNOSTIC,
      JobPriority.P4_WARMUP,
      JobPriority.P5_BACKGROUND_INDEX,
      JobPriority.P6_MAINTENANCE,
    ];

    for (const p of priorities) {
      if (ignoredPriorities?.has(p)) {
        continue;
      }
      const bucket = this.buckets.get(p);
      if (bucket && bucket.length > 0) {
        const job = bucket.shift()!;
        this.jobMap.delete(job.id);
        return job;
      }
    }

    return undefined;
  }

  public peek(ignoredPriorities?: Set<JobPriority>): ScheduledJob | undefined {
    const priorities = [
      JobPriority.P0_INTERACTIVE_SEARCH,
      JobPriority.P1_NAVIGATION,
      JobPriority.P2_INCREMENTAL_INDEX,
      JobPriority.P3_USER_TRIGGERED_DIAGNOSTIC,
      JobPriority.P4_WARMUP,
      JobPriority.P5_BACKGROUND_INDEX,
      JobPriority.P6_MAINTENANCE,
    ];

    for (const p of priorities) {
      if (ignoredPriorities?.has(p)) {
        continue;
      }
      const bucket = this.buckets.get(p);
      if (bucket && bucket.length > 0) {
        return bucket[0];
      }
    }

    return undefined;
  }

  public remove(jobId: string): boolean {
    const tracked = this.jobMap.get(jobId);
    if (!tracked) {
      return false;
    }

    const bucket = this.buckets.get(tracked.priority);
    if (bucket) {
      const idx = bucket.findIndex((j) => j.id === jobId);
      if (idx !== -1) {
        bucket.splice(idx, 1);
      }
    }
    this.jobMap.delete(jobId);
    return true;
  }

  public removeByGroup(groupId: string): number {
    let removed = 0;
    for (const [id, tracked] of Array.from(this.jobMap.entries())) {
      if (tracked.job.groupId === groupId) {
        if (this.remove(id)) {
          removed++;
        }
      }
    }
    return removed;
  }

  public reprioritize(jobId: string, newPriority: JobPriority): boolean {
    const tracked = this.jobMap.get(jobId);
    if (!tracked || tracked.priority === newPriority) {
      return false;
    }

    const job = tracked.job;
    this.remove(jobId);
    job.priority = newPriority;
    this.enqueue(job);
    return true;
  }

  public has(jobId: string): boolean {
    return this.jobMap.has(jobId);
  }

  public get(jobId: string): ScheduledJob | undefined {
    return this.jobMap.get(jobId)?.job;
  }

  public get size(): number {
    return this.jobMap.size;
  }

  public isEmpty(): boolean {
    return this.jobMap.size === 0;
  }

  public clear(): void {
    this.initBuckets();
    this.jobMap.clear();
  }
}
