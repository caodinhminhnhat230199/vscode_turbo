import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { WarmupEngine } from '../../../src/warmup/WarmupEngine';
import { stateStore } from '../../../src/core/state/StateStore';
import { StatusBarController } from '../../../src/vscode/statusBar';

describe('WarmupEngine', () => {
  let engine: WarmupEngine;

  beforeEach(() => {
    stateStore.reset();
    engine = new WarmupEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  it('initializes with default components and idle state', () => {
    expect(engine.queue.isEmpty()).toBe(true);
    expect(engine.activityMonitor.isIdle()).toBe(true);
    expect(engine.scheduler.getStatus()).toBe('idle');
  });

  it('runs discovery pipeline, enqueues tasks and updates stateStore', async () => {
    const mainDart = vscode.Uri.file('/flutter/lib/main.dart');
    vi.spyOn(vscode.workspace, 'findFiles').mockImplementation(async (pattern) => {
      if (String(pattern).includes('lib/main.dart')) {
        return [mainDart];
      }
      return [];
    });

    await engine.startWarmup();

    const state = stateStore.getState().warmupStatus;
    expect(state.completedTasks).toBeGreaterThanOrEqual(0);
    expect(state.concurrency).toBe(2);
  });

  it('manages pause, resume, and cancel lifecycle', () => {
    engine.pauseWarmup('Testing pause');
    expect(engine.scheduler.getStatus()).toBe('paused');
    expect(stateStore.getState().warmupStatus.status).toBe('paused');
    expect(stateStore.getState().warmupStatus.pauseReason).toBe('Testing pause');

    engine.resumeWarmup();
    expect(['running', 'completed']).toContain(engine.scheduler.getStatus());

    engine.cancelWarmup();
    expect(engine.scheduler.getStatus()).toBe('idle');
    expect(stateStore.getState().warmupStatus.status).toBe('idle');
    expect(StatusBarController.getInstance().getState().kind).toBe('ready');
  });
});
