import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { WarmupScheduler } from '../../../src/warmup/scheduler/WarmupScheduler';
import { WarmupPriorityQueue } from '../../../src/warmup/queue/WarmupPriorityQueue';
import { ActivityMonitor } from '../../../src/warmup/activity/ActivityMonitor';
import { AdapterRegistry } from '../../../src/index/adapters/AdapterRegistry';
import { LanguageAdapter } from '../../../src/index/adapters/LanguageAdapter';
import { createWarmupTask } from '../../../src/warmup/models/WarmupTask';

describe('WarmupScheduler', () => {
  let queue: WarmupPriorityQueue;
  let activityMonitor: ActivityMonitor;
  let registry: AdapterRegistry;
  let scheduler: WarmupScheduler;
  let warmedUris: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new WarmupPriorityQueue();
    activityMonitor = new ActivityMonitor({ highToLowCooldownMs: 500, lowToIdleCooldownMs: 300 });
    registry = new AdapterRegistry();
    warmedUris = [];

    const mockAdapter: LanguageAdapter = {
      id: 'mock-adapter',
      supportedLanguages: ['*'],
      capabilities: { supportsDocumentSymbols: true, supportsWarmup: true },
      canHandle: () => true,
      extractSymbols: async () => [],
      warmup: async (uri) => {
        warmedUris.push(uri.fsPath);
      },
    };
    registry.register(mockAdapter);

    scheduler = new WarmupScheduler(queue, {
      concurrency: 2,
      activityMonitor,
      adapterRegistry: registry,
    });
  });

  afterEach(() => {
    scheduler.dispose();
    activityMonitor.dispose();
    vi.useRealTimers();
  });

  it('drains queue respecting concurrency limit', async () => {
    const task1 = createWarmupTask({
      uri: vscode.Uri.file('/repo/1.ts'),
      priority: 2,
      source: 'gitChanged',
      reason: 'T1',
    });
    const task2 = createWarmupTask({
      uri: vscode.Uri.file('/repo/2.ts'),
      priority: 2,
      source: 'gitChanged',
      reason: 'T2',
    });
    const task3 = createWarmupTask({
      uri: vscode.Uri.file('/repo/3.ts'),
      priority: 2,
      source: 'gitChanged',
      reason: 'T3',
    });

    queue.enqueueBatch([task1, task2, task3]);
    scheduler.start();

    // Allow async microtasks to flush
    await vi.runAllTicks();
    await Promise.resolve();

    expect(scheduler.getStatus()).toBe('completed');
    expect(warmedUris).toHaveLength(3);
    expect(scheduler.getCompletedCount()).toBe(3);
  });

  it('pauses execution when user typing is high, resumes when idle', async () => {
    const statusChanges: string[] = [];
    const customScheduler = new WarmupScheduler(queue, {
      concurrency: 1,
      activityMonitor,
      adapterRegistry: registry,
      onStatusChange: (status) => statusChanges.push(status),
    });

    const task1 = createWarmupTask({
      uri: vscode.Uri.file('/repo/1.ts'),
      priority: 3,
      source: 'recentFiles',
      reason: 'T1',
    });
    const task2 = createWarmupTask({
      uri: vscode.Uri.file('/repo/2.ts'),
      priority: 3,
      source: 'recentFiles',
      reason: 'T2',
    });

    queue.enqueueBatch([task1, task2]);

    // User starts typing rapidly before start
    activityMonitor.recordEdit();
    expect(activityMonitor.isHigh()).toBe(true);

    customScheduler.start();
    expect(customScheduler.getStatus()).toBe('paused');
    expect(customScheduler.getPauseReason()).toContain('User typing');

    // Wait until idle cooldown
    vi.advanceTimersByTime(500); // to low
    vi.advanceTimersByTime(300); // to idle
    expect(activityMonitor.isIdle()).toBe(true);

    // Scheduler should automatically resume and drain
    await vi.runAllTicks();
    await Promise.resolve();

    expect(customScheduler.getStatus()).toBe('completed');
    expect(warmedUris).toHaveLength(2);

    customScheduler.dispose();
  });

  it('allows P0/P1 tasks to preempt even during high activity', async () => {
    activityMonitor.recordEdit();
    expect(activityMonitor.isHigh()).toBe(true);

    scheduler.start();
    expect(scheduler.getStatus()).toBe('paused');

    // Enqueue P0 active file
    const p0Task = createWarmupTask({
      uri: vscode.Uri.file('/repo/active.ts'),
      priority: 0,
      source: 'activeFile',
      reason: 'Active tab',
    });

    scheduler.enqueueAndDrain(p0Task);

    await vi.runAllTicks();
    await Promise.resolve();

    // P0 task should have run immediately despite paused background
    expect(warmedUris).toContain(p0Task.uri.fsPath);
    expect(scheduler.isFileWarmed(p0Task.uri.fsPath)).toBe(true);
  });

  it('prevents duplicate file warmups', async () => {
    const task1 = createWarmupTask({
      uri: vscode.Uri.file('/repo/common.ts'),
      priority: 2,
      source: 'gitChanged',
      reason: 'First run',
    });

    queue.enqueue(task1);
    scheduler.start();

    await vi.runAllTicks();
    await Promise.resolve();

    expect(warmedUris).toHaveLength(1);

    // Try enqueueing same file again
    const task2 = createWarmupTask({
      uri: vscode.Uri.file('/repo/common.ts'),
      priority: 1,
      source: 'entryPoint',
      reason: 'Second run',
    });

    scheduler.enqueueAndDrain(task2);

    await vi.runAllTicks();
    await Promise.resolve();

    // Should still have warmed only once
    expect(warmedUris).toHaveLength(1);
  });

  it('cancels background work cleanly', () => {
    const task = createWarmupTask({
      uri: vscode.Uri.file('/repo/1.ts'),
      priority: 2,
      source: 'gitChanged',
      reason: 'T1',
    });
    queue.enqueue(task);

    scheduler.start();
    scheduler.cancel();

    expect(scheduler.getStatus()).toBe('idle');
    expect(queue.isEmpty()).toBe(true);
  });
});
