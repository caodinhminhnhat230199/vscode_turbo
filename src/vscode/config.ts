import * as vscode from 'vscode';
import { LogLevel } from '../core/logging/LogLevel';
import { logger } from '../core/logging/Logger';

export interface VsTurboConfig {
  enabled: boolean;
  loggingLevel: LogLevel;
  diagnosticsEnabled: boolean;
  slowThresholdMs: number;
  indexEnabled: boolean;
  indexGeneratedFiles: boolean;
  maxFileSizeBytes: number;
  warmupEnabled: boolean;
  warmupOnStartup: boolean;
  warmupConcurrency: number;
  warmupUseGitChanges: boolean;
  warmupUseRecentFiles: boolean;
  searchUseRipgrep: boolean;
  searchUseNativeQuickPick: boolean;
  searchDialogMode: 'floatingDialog' | 'editorTab';
  searchKeymap: 'off' | 'androidStudio';
  searchDefaultMode: 'all' | 'class' | 'file' | 'symbol' | 'text';
  navigationMode: 'native' | 'hybrid' | 'vsturbo' | 'codepulse';
  navigationTrackHistory: boolean;
}

export type CodePulseConfig = VsTurboConfig;

export const DEFAULT_CONFIG: VsTurboConfig = {
  enabled: true,
  loggingLevel: 'info',
  diagnosticsEnabled: true,
  slowThresholdMs: 500,
  indexEnabled: true,
  indexGeneratedFiles: false,
  maxFileSizeBytes: 1024 * 1024,
  warmupEnabled: true,
  warmupOnStartup: true,
  warmupConcurrency: 2,
  warmupUseGitChanges: true,
  warmupUseRecentFiles: true,
  searchUseRipgrep: true,
  searchUseNativeQuickPick: true,
  searchDialogMode: 'floatingDialog',
  searchKeymap: 'androidStudio',
  searchDefaultMode: 'all',
  navigationMode: 'native',
  navigationTrackHistory: true,
};

import { IConfigurationService } from '../core/interfaces/IConfigurationService';

export class ConfigService implements IConfigurationService {
  private static instance: ConfigService | null = null;
  private currentConfig: VsTurboConfig = { ...DEFAULT_CONFIG };
  private changeEmitter = new vscode.EventEmitter<VsTurboConfig>();
  public readonly onDidChangeConfig = this.changeEmitter.event;

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public initialize(context: vscode.ExtensionContext): void {
    this.reloadConfig();
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('vsturbo') || e.affectsConfiguration('codePulse')) {
          this.reloadConfig();
        }
      })
    );
  }

  public getConfig(): VsTurboConfig {
    return { ...this.currentConfig };
  }

  public get<T>(section: string, defaultValue?: T): T {
    const ws = vscode.workspace.getConfiguration('vsturbo');
    const val = ws.get<T>(section);
    if (val !== undefined) {
      return val;
    }
    const legacyWs = vscode.workspace.getConfiguration('codePulse');
    return legacyWs.get<T>(section, defaultValue as T);
  }

  public async update(
    section: string,
    value: unknown,
    target?: vscode.ConfigurationTarget
  ): Promise<void> {
    const ws = vscode.workspace.getConfiguration('vsturbo');
    await ws.update(section, value, target ?? vscode.ConfigurationTarget.Global);
  }

  public reloadConfig(): VsTurboConfig {
    const ws = vscode.workspace.getConfiguration('vsturbo');
    const legacyWs = vscode.workspace.getConfiguration('codePulse');

    const getVal = <T>(sec: string, def: T): T => {
      const v = ws.get<T>(sec);
      if (v !== undefined) {
        return v;
      }
      return legacyWs.get<T>(sec, def);
    };

    const rawSlowThreshold = getVal<number>(
      'diagnostics.slowThresholdMs',
      DEFAULT_CONFIG.slowThresholdMs
    );
    const slowThresholdMs =
      typeof rawSlowThreshold === 'number' && rawSlowThreshold > 0
        ? rawSlowThreshold
        : DEFAULT_CONFIG.slowThresholdMs;

    const rawMaxFileSize = getVal<number>(
      'index.maxFileSizeBytes',
      DEFAULT_CONFIG.maxFileSizeBytes
    );
    const maxFileSizeBytes =
      typeof rawMaxFileSize === 'number' && rawMaxFileSize > 0
        ? rawMaxFileSize
        : DEFAULT_CONFIG.maxFileSizeBytes;

    const rawConcurrency = getVal<number>('warmup.concurrency', DEFAULT_CONFIG.warmupConcurrency);
    const warmupConcurrency =
      typeof rawConcurrency === 'number' && rawConcurrency >= 1 && rawConcurrency <= 8
        ? rawConcurrency
        : DEFAULT_CONFIG.warmupConcurrency;

    const loggingLevel = getVal<LogLevel>('logging.level', DEFAULT_CONFIG.loggingLevel);
    logger.setLevel(loggingLevel);

    const navMode = getVal<'native' | 'hybrid' | 'vsturbo' | 'codepulse'>(
      'navigation.mode',
      DEFAULT_CONFIG.navigationMode
    );
    const navigationMode = ['native', 'hybrid', 'vsturbo', 'codepulse'].includes(navMode)
      ? navMode
      : DEFAULT_CONFIG.navigationMode;

    this.currentConfig = {
      enabled: getVal<boolean>('enabled', DEFAULT_CONFIG.enabled),
      loggingLevel,
      diagnosticsEnabled: getVal<boolean>('diagnostics.enabled', DEFAULT_CONFIG.diagnosticsEnabled),
      slowThresholdMs,
      indexEnabled: getVal<boolean>('index.enabled', DEFAULT_CONFIG.indexEnabled),
      indexGeneratedFiles: getVal<boolean>(
        'index.generatedFiles',
        DEFAULT_CONFIG.indexGeneratedFiles
      ),
      maxFileSizeBytes,
      warmupEnabled: getVal<boolean>('warmup.enabled', DEFAULT_CONFIG.warmupEnabled),
      warmupOnStartup: getVal<boolean>('warmup.onStartup', DEFAULT_CONFIG.warmupOnStartup),
      warmupConcurrency,
      warmupUseGitChanges: getVal<boolean>(
        'warmup.useGitChanges',
        DEFAULT_CONFIG.warmupUseGitChanges
      ),
      warmupUseRecentFiles: getVal<boolean>(
        'warmup.useRecentFiles',
        DEFAULT_CONFIG.warmupUseRecentFiles
      ),
      searchUseRipgrep: getVal<boolean>('search.useRipgrep', DEFAULT_CONFIG.searchUseRipgrep),
      searchUseNativeQuickPick: getVal<boolean>(
        'search.useNativeQuickPick',
        DEFAULT_CONFIG.searchUseNativeQuickPick
      ),
      searchDialogMode: getVal<'floatingDialog' | 'editorTab'>(
        'search.dialogMode',
        DEFAULT_CONFIG.searchDialogMode
      ),
      searchKeymap: getVal<'off' | 'androidStudio'>('search.keymap', DEFAULT_CONFIG.searchKeymap),
      searchDefaultMode: getVal<'all' | 'class' | 'file' | 'symbol' | 'text'>(
        'search.defaultMode',
        DEFAULT_CONFIG.searchDefaultMode
      ),
      navigationMode,
      navigationTrackHistory: getVal<boolean>(
        'navigation.trackHistory',
        DEFAULT_CONFIG.navigationTrackHistory
      ),
    };

    this.changeEmitter.fire(this.currentConfig);
    return this.currentConfig;
  }
}

export const configService = ConfigService.getInstance();
