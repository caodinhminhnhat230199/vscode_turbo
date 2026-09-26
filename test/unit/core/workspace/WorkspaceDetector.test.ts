import { describe, it, expect, beforeEach } from 'vitest';
import { workspace, window, Uri } from '../../../mocks/vscode';
import { workspaceDetector } from '../../../../src/core/workspace/WorkspaceDetector';
import { eventBus } from '../../../../src/core/events/EventBus';
import { stateStore } from '../../../../src/core/state/StateStore';

describe('WorkspaceDetector', () => {
  const mockContext = {
    subscriptions: [],
  } as any;

  beforeEach(() => {
    stateStore.reset();
    workspaceDetector.dispose();
    workspace._setWorkspaceFolders(undefined);
    window._setActiveTextEditor(undefined);
    workspaceDetector.initialize(mockContext);
  });

  it('handles zero-root workspace (no folders open)', () => {
    workspace._setWorkspaceFolders(undefined);
    const state = workspaceDetector.refresh();

    expect(state.isEmpty).toBe(true);
    expect(state.isMultiRoot).toBe(false);
    expect(state.folders).toHaveLength(0);
    expect(state.activeFolder).toBeUndefined();
    expect(stateStore.getState().workspace.folderCount).toBe(0);
  });

  it('handles single-root workspace and normalizes paths', () => {
    workspace._setWorkspaceFolders([
      {
        name: 'project-a',
        uri: Uri.file('/workspaces/project-a/'),
        index: 0,
      },
    ]);

    const state = workspaceDetector.refresh();

    expect(state.isEmpty).toBe(false);
    expect(state.isMultiRoot).toBe(false);
    expect(state.folders).toHaveLength(1);
    expect(state.folders[0].name).toBe('project-a');
    expect(state.folders[0].fsPath).not.toMatch(/[\\/]$/);
    expect(state.activeFolder?.name).toBe('project-a');
    expect(stateStore.getState().workspace.folderCount).toBe(1);
  });

  it('handles multi-root workspace and tracks active editor root', () => {
    workspace._setWorkspaceFolders([
      {
        name: 'frontend',
        uri: Uri.file('/workspaces/repo/frontend'),
        index: 0,
      },
      {
        name: 'backend',
        uri: Uri.file('/workspaces/repo/backend'),
        index: 1,
      },
    ]);

    let state = workspaceDetector.refresh();
    expect(state.isMultiRoot).toBe(true);
    expect(state.folders).toHaveLength(2);
    expect(state.activeFolder?.name).toBe('frontend');

    // Simulate opening file in backend
    window._setActiveTextEditor({
      document: { uri: Uri.file('/workspaces/repo/backend/src/server.ts') },
    });

    state = workspaceDetector.getState();
    expect(state.activeFolder?.name).toBe('backend');
  });

  it('emits workspaceFoldersChanged events via eventBus', () => {
    let eventPayload: any = null;
    const unsubscribe = eventBus.on('workspaceFoldersChanged', (payload) => {
      eventPayload = payload;
    });

    workspace._setWorkspaceFolders([
      {
        name: 'test-app',
        uri: Uri.file('/test/app'),
        index: 0,
      },
    ]);

    expect(eventPayload).not.toBeNull();
    expect(eventPayload.folders).toHaveLength(1);
    expect(eventPayload.folders[0].name).toBe('test-app');

    unsubscribe();
  });
});
