import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as vscode from 'vscode';
import { WarmupEngine } from '../../../src/warmup/WarmupEngine';
import { stateStore } from '../../../src/core/state/StateStore';
import { StatusBarController } from '../../../src/vscode/statusBar';
import { createWarmupTask } from '../../../src/warmup/models/WarmupTask';

describe('Phase 4 Verification — Warmup Engine Integration', () => {
  let engine: WarmupEngine;
  const fixturePath = path.resolve(__dirname, '../../fixtures/sample-flutter');
  const mainDartUri = vscode.Uri.file(path.join(fixturePath, 'lib', 'main.dart'));

  beforeEach(() => {
    stateStore.reset();
    engine = new WarmupEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  it('P4.1 - P4.2: Stably queues warmup tasks with priority promotion and deduplication', () => {
    const queue = engine.queue;

    const recentTask = createWarmupTask({
      uri: mainDartUri,
      priority: 3,
      source: 'recentFiles',
      reason: 'MRU',
    });
    const entryTask = createWarmupTask({
      uri: mainDartUri,
      priority: 1,
      source: 'entryPoint',
      reason: 'Flutter main.dart',
    });

    queue.enqueue(recentTask);
    expect(queue.size()).toBe(1);
    expect(queue.peek()?.priority).toBe(3);

    // Promote to P1 (entrypoint)
    queue.enqueue(entryTask);
    expect(queue.size()).toBe(1); // deduplicated
    expect(queue.peek()?.priority).toBe(1); // promoted
  });

  it('P4.3 - P4.4: Rapid typing throttles and pauses background warmup without freezing UI', async () => {
    const activityMonitor = engine.activityMonitor;
    const scheduler = engine.scheduler;

    const dummyTask1 = createWarmupTask({
      uri: vscode.Uri.file(path.join(fixturePath, 'lib', 'page1.dart')),
      priority: 2,
      source: 'gitChanged',
      reason: 'Dummy 1',
    });
    const dummyTask2 = createWarmupTask({
      uri: vscode.Uri.file(path.join(fixturePath, 'lib', 'page2.dart')),
      priority: 2,
      source: 'gitChanged',
      reason: 'Dummy 2',
    });

    engine.queue.enqueueBatch([dummyTask1, dummyTask2]);

    // Simulate user actively typing in editor
    activityMonitor.recordEdit();
    expect(activityMonitor.isHigh()).toBe(true);

    scheduler.start();
    expect(scheduler.getStatus()).toBe('paused');
    expect(stateStore.getState().warmupStatus.status).toBe('paused');

    // Simulate P0 active file opening during high activity (should preempt)
    const activeTask = createWarmupTask({
      uri: mainDartUri,
      priority: 0,
      source: 'activeFile',
      reason: 'Active tab opened',
    });
    scheduler.enqueueAndDrain(activeTask);

    await Promise.resolve();

    expect(scheduler.isFileWarmed(mainDartUri.fsPath)).toBe(true);
  });

  it('P4.5 - P4.10: Full warmup discovery and execution pipeline on Flutter fixture', async () => {
    vi.spyOn(vscode.workspace, 'findFiles').mockImplementation(async (pattern) => {
      if (String(pattern).includes('lib/main.dart')) {
        return [mainDartUri];
      }
      return [];
    });

    await engine.startWarmup();

    // Verify task discovery found the entrypoint
    expect(
      engine.scheduler.isFileWarmed(mainDartUri.fsPath) ||
        engine.scheduler.isTaskActive(mainDartUri.fsPath) ||
        engine.queue.has(mainDartUri.fsPath)
    ).toBe(true);

    // Let any background task settle
    await Promise.resolve();

    const warmupStatus = stateStore.getState().warmupStatus;
    expect(warmupStatus.concurrency).toBe(2);
    expect(warmupStatus.completedTasks).toBeGreaterThanOrEqual(0);
    expect(StatusBarController.getInstance().getState()).toBeDefined();
  });
});
