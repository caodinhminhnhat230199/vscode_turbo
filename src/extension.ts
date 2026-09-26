import * as vscode from 'vscode';
import { logger } from './core/logging/Logger';
import { configService } from './vscode/config';
import { registerCommands } from './vscode/commands';
import { DashboardProvider } from './webview/DashboardProvider';
import { storageManager } from './core/workspace/StorageManager';
import { workspaceDetector } from './core/workspace/WorkspaceDetector';
import { statusBar } from './vscode/statusBar';
import { WarmupEngine } from './warmup/WarmupEngine';
import { indexEngine } from './index/engine/IndexEngine';
import { indexWatcher } from './index/engine/IndexWatcher';
import { RipgrepEngine } from './search/engine/RipgrepEngine';

export function activate(context: vscode.ExtensionContext): void {
  const activationStart = performance.now();

  // 1. Initialize Output Channel & Logger
  const outputChannel = vscode.window.createOutputChannel('CodePulse');
  context.subscriptions.push(outputChannel);
  logger.setOutputChannel(outputChannel);

  // 2. Initialize Lightweight Configuration & Workspace
  configService.initialize(context);
  storageManager.initialize(context);
  workspaceDetector.initialize(context);
  context.subscriptions.push({ dispose: () => workspaceDetector.dispose() });

  // 3. Register Commands & Status Bar
  registerCommands(context);
  context.subscriptions.push(statusBar);

  // 3b. Initialize Warmup Engine & Indexing Services
  const warmupEngine = WarmupEngine.getInstance({ memento: context.workspaceState });
  context.subscriptions.push(warmupEngine);
  context.subscriptions.push(indexEngine);
  context.subscriptions.push(indexWatcher);
  context.subscriptions.push({ dispose: () => RipgrepEngine.killAllProcesses() });

  const initializeIndexing = (): void => {
    const currentConfig = configService.getConfig();
    const roots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
    if (!currentConfig.enabled || !currentConfig.indexEnabled || roots.length === 0) {
      indexWatcher.stopWatching();
      indexEngine.pause();
      return;
    }

    indexEngine.configure({
      storageDir: context.storageUri?.fsPath,
      maxFileSizeBytes: currentConfig.maxFileSizeBytes,
    });
    indexEngine.resume();
    indexWatcher.startWatching();
    void indexEngine.initialize(roots).catch((error: unknown) => {
      logger.error('Failed to initialize project index', error);
    });
  };

  initializeIndexing();
  context.subscriptions.push(
    configService.onDidChangeConfig(() => {
      initializeIndexing();
    })
  );

  // 4. Register Dashboard Webview View
  const dashboardProvider = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardProvider.viewType, dashboardProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  const activationDuration = performance.now() - activationStart;
  logger.info(`CodePulse activated in ${activationDuration.toFixed(2)}ms`);

  // 5. Defer any workspace scan / background operations to idle time
  const config = configService.getConfig();
  if (config.enabled && config.warmupOnStartup) {
    setTimeout(() => {
      vscode.commands.executeCommand('codePulse.warmupProject');
    }, 2000);
  }
}

export function deactivate(): void {
  RipgrepEngine.killAllProcesses();
  logger.info('CodePulse deactivated');
}
