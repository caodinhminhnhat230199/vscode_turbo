import { WarmupTask } from '../models/WarmupTask';

export class WarmupPriorityQueue {
  private tasks: WarmupTask[] = [];
  private taskMap = new Map<string, WarmupTask>(); // normalized fsPath -> task

  public size(): number {
    return this.tasks.length;
  }

  public isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  public peek(): WarmupTask | undefined {
    return this.tasks[0];
  }

  public enqueue(task: WarmupTask): void {
    const key = this.normalizeKey(task.uri.fsPath);
    const existing = this.taskMap.get(key);

    if (existing) {
      // Priority promotion: if new priority is higher (lower numerical value), promote existing task
      if (task.priority < existing.priority) {
        existing.priority = task.priority;
        existing.source = task.source;
        existing.reason = task.reason;
        this.resort();
      }
      return;
    }

    this.tasks.push(task);
    this.taskMap.set(key, task);
    this.resort();
  }

  public enqueueBatch(tasks: WarmupTask[]): void {
    for (const task of tasks) {
      const key = this.normalizeKey(task.uri.fsPath);
      const existing = this.taskMap.get(key);

      if (existing) {
        if (task.priority < existing.priority) {
          existing.priority = task.priority;
          existing.source = task.source;
          existing.reason = task.reason;
        }
      } else {
        this.tasks.push(task);
        this.taskMap.set(key, task);
      }
    }
    this.resort();
  }

  public dequeue(): WarmupTask | undefined {
    const task = this.tasks.shift();
    if (task) {
      this.taskMap.delete(this.normalizeKey(task.uri.fsPath));
    }
    return task;
  }

  public remove(fsPath: string): boolean {
    const key = this.normalizeKey(fsPath);
    const existing = this.taskMap.get(key);
    if (!existing) {
      return false;
    }

    this.taskMap.delete(key);
    const idx = this.tasks.indexOf(existing);
    if (idx >= 0) {
      this.tasks.splice(idx, 1);
    }
    return true;
  }

  public clear(): void {
    this.tasks = [];
    this.taskMap.clear();
  }

  public getAll(): readonly WarmupTask[] {
    return [...this.tasks];
  }

  public has(fsPath: string): boolean {
    return this.taskMap.has(this.normalizeKey(fsPath));
  }

  private resort(): void {
    this.tasks.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower number = higher priority
      }
      return a.addedAt - b.addedAt; // FIFO tie breaker
    });
  }

  private normalizeKey(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
  }
}
