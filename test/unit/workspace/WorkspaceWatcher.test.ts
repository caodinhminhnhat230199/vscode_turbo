import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { WorkspaceWatcher } from '../../../src/workspace/WorkspaceWatcher';
import { eventBus } from '../../../src/core/events/EventBus';

describe('WorkspaceWatcher', () => {
  let watcher: WorkspaceWatcher;

  beforeEach(() => {
    watcher = new WorkspaceWatcher({ debounceMs: 10, bulkThreshold: 5 });
  });

  afterEach(() => {
    watcher.stopWatching();
  });

  it('batches and emits fileCreated event', async () => {
    let received: any = null;
    const unsub = eventBus.on('fileCreated', (data) => {
      received = data;
    });

    watcher.handleEvent(vscode.Uri.file('/workspace/src/test.ts'), 'create');
    await new Promise((r) => setTimeout(r, 30));

    expect(received).toBeDefined();
    expect(received?.fsPath).toContain('test.ts');
    unsub();
  });

  it('detects bulk changes when file count exceeds bulkThreshold', async () => {
    let bulkEvent: any = null;
    const unsub = eventBus.on('bulkChangeDetected', (data) => {
      bulkEvent = data;
    });

    for (let i = 0; i < 10; i++) {
      watcher.handleEvent(vscode.Uri.file(`/workspace/src/file_${i}.ts`), 'create');
    }

    await new Promise((r) => setTimeout(r, 30));

    expect(bulkEvent).toBeDefined();
    expect(bulkEvent.fileCount).toBe(10);
    expect(bulkEvent.type).toBe('bulk_edit');
    unsub();
  });
});
