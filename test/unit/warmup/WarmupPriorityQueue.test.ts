import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { WarmupPriorityQueue } from '../../../src/warmup/queue/WarmupPriorityQueue';
import { createWarmupTask } from '../../../src/warmup/models/WarmupTask';

describe('WarmupPriorityQueue', () => {
  let queue: WarmupPriorityQueue;

  beforeEach(() => {
    queue = new WarmupPriorityQueue();
  });

  it('starts empty', () => {
    expect(queue.isEmpty()).toBe(true);
    expect(queue.size()).toBe(0);
    expect(queue.peek()).toBeUndefined();
  });

  it('orders tasks stably by priority (lower number = higher priority)', () => {
    const p3 = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/recent.ts'),
      priority: 3,
      source: 'recentFiles',
      reason: 'Recent',
      addedAt: 1000,
    });
    const p0 = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/active.ts'),
      priority: 0,
      source: 'activeFile',
      reason: 'Active',
      addedAt: 2000,
    });
    const p1 = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/main.ts'),
      priority: 1,
      source: 'entryPoint',
      reason: 'Entry',
      addedAt: 1500,
    });

    queue.enqueue(p3);
    queue.enqueue(p0);
    queue.enqueue(p1);

    expect(queue.size()).toBe(3);
    expect(queue.dequeue()?.id).toBe(p0.id);
    expect(queue.dequeue()?.id).toBe(p1.id);
    expect(queue.dequeue()?.id).toBe(p3.id);
    expect(queue.isEmpty()).toBe(true);
  });

  it('breaks ties using FIFO addedAt ordering', () => {
    const taskA = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/a.ts'),
      priority: 2,
      source: 'gitChanged',
      reason: 'Changed first',
      addedAt: 100,
    });
    const taskB = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/b.ts'),
      priority: 2,
      source: 'gitChanged',
      reason: 'Changed second',
      addedAt: 200,
    });

    queue.enqueue(taskB);
    queue.enqueue(taskA);

    // FIFO tie-break: taskA was addedAt 100 < taskB addedAt 200
    expect(queue.dequeue()?.uri.fsPath).toBe(taskA.uri.fsPath);
    expect(queue.dequeue()?.uri.fsPath).toBe(taskB.uri.fsPath);
  });

  it('deduplicates tasks with same normalized path', () => {
    const task1 = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/file.ts'),
      priority: 3,
      source: 'recentFiles',
      reason: 'Recent',
    });
    const task2 = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/file.ts'),
      priority: 3,
      source: 'recentFiles',
      reason: 'Duplicate',
    });

    queue.enqueue(task1);
    queue.enqueue(task2);

    expect(queue.size()).toBe(1);
    expect(queue.has('/repo/src/file.ts')).toBe(true);
  });

  it('promotes task priority when duplicate with higher priority is enqueued', () => {
    const lowPriority = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/file.ts'),
      priority: 3,
      source: 'recentFiles',
      reason: 'Recent file',
    });
    const highPriority = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/file.ts'),
      priority: 0,
      source: 'activeFile',
      reason: 'Active editor file',
    });

    const other = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/other.ts'),
      priority: 1,
      source: 'entryPoint',
      reason: 'Main',
    });

    queue.enqueue(lowPriority);
    queue.enqueue(other);

    // Queue order currently: other (p1), file (p3)
    expect(queue.peek()?.uri.fsPath).toBe(other.uri.fsPath);

    // Now promote file to P0
    queue.enqueue(highPriority);

    expect(queue.size()).toBe(2);
    // After promotion, file should be at the head of queue (P0)
    const first = queue.dequeue();
    expect(first?.uri.fsPath).toBe(lowPriority.uri.fsPath);
    expect(first?.priority).toBe(0);
    expect(first?.source).toBe('activeFile');
  });

  it('supports removal, clearing, and peek', () => {
    const task1 = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/1.ts'),
      priority: 1,
      source: 'entryPoint',
      reason: 'R1',
    });
    const task2 = createWarmupTask({
      uri: vscode.Uri.file('/repo/src/2.ts'),
      priority: 2,
      source: 'gitChanged',
      reason: 'R2',
    });

    queue.enqueueBatch([task1, task2]);
    expect(queue.size()).toBe(2);
    expect(queue.peek()?.id).toBe(task1.id);

    const removed = queue.remove('/repo/src/1.ts');
    expect(removed).toBe(true);
    expect(queue.size()).toBe(1);
    expect(queue.peek()?.id).toBe(task2.id);

    queue.clear();
    expect(queue.isEmpty()).toBe(true);
    expect(queue.getAll()).toHaveLength(0);
  });
});
