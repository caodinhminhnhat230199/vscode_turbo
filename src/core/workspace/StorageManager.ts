import type * as vscode from 'vscode';
import { logger } from '../logging/Logger';

export interface StorageMemento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
  keys(): readonly string[];
}

export class StorageManager {
  private static instance: StorageManager | null = null;
  private static readonly STORAGE_SCHEMA_VERSION = 1;
  private static readonly VERSION_KEY = 'codepulse.storage.version';

  private workspaceState: StorageMemento | null = null;
  private globalState: StorageMemento | null = null;

  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  public initialize(context: vscode.ExtensionContext): void {
    this.workspaceState = context.workspaceState;
    this.globalState = context.globalState;
    this.verifyAndMigrate();
  }

  public setMementosForTest(workspace: StorageMemento, global: StorageMemento): void {
    this.workspaceState = workspace;
    this.globalState = global;
    this.verifyAndMigrate();
  }

  private verifyAndMigrate(): void {
    if (!this.workspaceState) {
      return;
    }
    const currentVersion = this.workspaceState.get<number>(StorageManager.VERSION_KEY, 0);
    if (currentVersion < StorageManager.STORAGE_SCHEMA_VERSION) {
      logger.info('Migrating storage state', {
        from: currentVersion,
        to: StorageManager.STORAGE_SCHEMA_VERSION,
      });
      // Migration hooks can be added here as versions evolve
      this.workspaceState.update(StorageManager.VERSION_KEY, StorageManager.STORAGE_SCHEMA_VERSION);
    }
  }

  public getWorkspace<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.workspaceState) {
      return defaultValue;
    }
    return this.workspaceState.get<T>(key, defaultValue as T);
  }

  public async setWorkspace(key: string, value: unknown): Promise<void> {
    if (this.workspaceState) {
      await this.workspaceState.update(key, value);
    }
  }

  public getGlobal<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.globalState) {
      return defaultValue;
    }
    return this.globalState.get<T>(key, defaultValue as T);
  }

  public async setGlobal(key: string, value: unknown): Promise<void> {
    if (this.globalState) {
      await this.globalState.update(key, value);
    }
  }
}

export const storageManager = StorageManager.getInstance();
