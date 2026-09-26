import * as path from 'path';
import * as vscode from 'vscode';
import { logger } from '../logging/Logger';
import { eventBus } from '../events/EventBus';
import { stateStore } from '../state/StateStore';
import { WorkspaceFolderInfo, WorkspaceState, createEmptyWorkspaceState } from './WorkspaceState';

export class WorkspaceDetector {
  private static instance: WorkspaceDetector | null = null;
  private state: WorkspaceState = createEmptyWorkspaceState();
  private disposables: vscode.Disposable[] = [];

  public static getInstance(): WorkspaceDetector {
    if (!WorkspaceDetector.instance) {
      WorkspaceDetector.instance = new WorkspaceDetector();
    }
    return WorkspaceDetector.instance;
  }

  public initialize(context: vscode.ExtensionContext): void {
    this.refresh();

    if (vscode.workspace.onDidChangeWorkspaceFolders) {
      const foldersSub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.refresh();
      });
      this.disposables.push(foldersSub);
      context.subscriptions.push(foldersSub);
    }

    if (vscode.window.onDidChangeActiveTextEditor) {
      const editorSub = vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.updateActiveFolder(editor?.document?.uri);
      });
      this.disposables.push(editorSub);
      context.subscriptions.push(editorSub);
    }
  }

  public refresh(): WorkspaceState {
    const rawFolders = (vscode.workspace.workspaceFolders ??
      []) as readonly vscode.WorkspaceFolder[];
    const normalizedFolders = this.normalizeFolders(rawFolders);

    const activeFolder = this.identifyActiveFolder(
      normalizedFolders,
      vscode.window.activeTextEditor?.document?.uri
    );

    const newState: WorkspaceState = {
      folders: normalizedFolders,
      activeFolder,
      isMultiRoot: normalizedFolders.length > 1,
      isEmpty: normalizedFolders.length === 0,
    };

    this.state = newState;

    logger.debug('Workspace folders detected', {
      folderCount: newState.folders.length,
      isMultiRoot: newState.isMultiRoot,
      activeFolder: activeFolder?.name,
    });

    const currentSummary = stateStore.getState().workspace;
    stateStore.updateWorkspace({
      ...currentSummary,
      folderCount: newState.folders.length,
    });

    eventBus.emit('workspaceFoldersChanged', {
      folders: newState.folders,
      activeFolder: newState.activeFolder,
    });

    return this.getState();
  }

  public normalizeFolders(folders: readonly vscode.WorkspaceFolder[]): WorkspaceFolderInfo[] {
    return folders.map((folder, index) => {
      const fsPath = path.normalize(folder.uri.fsPath).replace(/[\\/]+$/, '');
      return {
        name: folder.name,
        uri: folder.uri.toString(),
        fsPath,
        index: typeof folder.index === 'number' ? folder.index : index,
      };
    });
  }

  public identifyActiveFolder(
    folders: WorkspaceFolderInfo[],
    documentUri?: vscode.Uri
  ): WorkspaceFolderInfo | undefined {
    if (folders.length === 0) {
      return undefined;
    }

    if (documentUri) {
      if (typeof vscode.workspace.getWorkspaceFolder === 'function') {
        const matched = vscode.workspace.getWorkspaceFolder(documentUri);
        if (matched) {
          const matchFsPath = path.normalize(matched.uri.fsPath).replace(/[\\/]+$/, '');
          const found = folders.find((f) => f.fsPath.toLowerCase() === matchFsPath.toLowerCase());
          if (found) {
            return found;
          }
        }
      }

      const docPath = path.normalize(documentUri.fsPath).toLowerCase();
      const sorted = [...folders].sort((a, b) => b.fsPath.length - a.fsPath.length);
      for (const folder of sorted) {
        const folderPath = folder.fsPath.toLowerCase();
        if (docPath === folderPath || docPath.startsWith(folderPath + path.sep)) {
          return folder;
        }
      }
    }

    return folders[0];
  }

  public updateActiveFolder(documentUri?: vscode.Uri): void {
    const previous = this.state.activeFolder;
    const activeFolder = this.identifyActiveFolder(this.state.folders, documentUri);

    if (previous?.fsPath !== activeFolder?.fsPath) {
      this.state = {
        ...this.state,
        activeFolder,
      };

      eventBus.emit('workspaceFoldersChanged', {
        folders: this.state.folders,
        activeFolder: this.state.activeFolder,
      });
    }
  }

  public getState(): WorkspaceState {
    return {
      ...this.state,
      folders: [...this.state.folders],
    };
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

export const workspaceDetector = WorkspaceDetector.getInstance();
