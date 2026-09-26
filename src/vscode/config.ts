import * as vscode from 'vscode';
import { LogLevel } from '../core/logging/LogLevel';
import { logger } from '../core/logging/Logger';

export interface CodePulseConfig {
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
  navigationMode: 'native' | 'hybrid' | 'codepulse';
  navigationTrackHistory: boolean;
}

export const DEFAULT_CONFIG: CodePulseConfig = {
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
  navigationMode: 'native',
  navigationTrackHistory: true,
};

export class ConfigService {
  private static instance: ConfigService | null = null;
  private currentConfig: CodePulseConfig = { ...DEFAULT_CONFIG };
  private changeEmitter = new vscode.EventEmitter<CodePulseConfig>();
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
        if (e.affectsConfiguration('codePulse')) {
          this.reloadConfig();
        }
      })
    );
  }

  public getConfig(): CodePulseConfig {
    return { ...this.currentConfig };
  }

  public reloadConfig(): CodePulseConfig {
    const ws = vscode.workspace.getConfiguration('codePulse');

    const rawSlowThreshold = ws.get<number>(
      'diagnostics.slowThresholdMs',
      DEFAULT_CONFIG.slowThresholdMs
    );
    const slowThresholdMs =
      typeof rawSlowThreshold === 'number' && rawSlowThreshold > 0
        ? rawSlowThreshold
        : DEFAULT_CONFIG.slowThresholdMs;

    const rawMaxFileSize = ws.get<number>(
      'index.maxFileSizeBytes',
      DEFAULT_CONFIG.maxFileSizeBytes
    );
    const maxFileSizeBytes =
      typeof rawMaxFileSize === 'number' && rawMaxFileSize > 0
        ? rawMaxFileSize
        : DEFAULT_CONFIG.maxFileSizeBytes;

    const rawConcurrency = ws.get<number>('warmup.concurrency', DEFAULT_CONFIG.warmupConcurrency);
    const warmupConcurrency =
      typeof rawConcurrency === 'number' && rawConcurrency >= 1 && rawConcurrency <= 8
        ? rawConcurrency
        : DEFAULT_CONFIG.warmupConcurrency;

    const loggingLevel = ws.get<LogLevel>('logging.level', DEFAULT_CONFIG.loggingLevel);
    logger.setLevel(loggingLevel);

    const navMode = ws.get<'native' | 'hybrid' | 'codepulse'>(
      'navigation.mode',
      DEFAULT_CONFIG.navigationMode
    );
    const navigationMode = ['native', 'hybrid', 'codepulse'].includes(navMode)
      ? navMode
      : DEFAULT_CONFIG.navigationMode;

    this.currentConfig = {
      enabled: ws.get<boolean>('enabled', DEFAULT_CONFIG.enabled),
      loggingLevel,
      diagnosticsEnabled: ws.get<boolean>('diagnostics.enabled', DEFAULT_CONFIG.diagnosticsEnabled),
      slowThresholdMs,
      indexEnabled: ws.get<boolean>('index.enabled', DEFAULT_CONFIG.indexEnabled),
      indexGeneratedFiles: ws.get<boolean>(
        'index.generatedFiles',
        DEFAULT_CONFIG.indexGeneratedFiles
      ),
      maxFileSizeBytes,
      warmupEnabled: ws.get<boolean>('warmup.enabled', DEFAULT_CONFIG.warmupEnabled),
      warmupOnStartup: ws.get<boolean>('warmup.onStartup', DEFAULT_CONFIG.warmupOnStartup),
      warmupConcurrency,
      warmupUseGitChanges: ws.get<boolean>(
        'warmup.useGitChanges',
        DEFAULT_CONFIG.warmupUseGitChanges
      ),
      warmupUseRecentFiles: ws.get<boolean>(
        'warmup.useRecentFiles',
        DEFAULT_CONFIG.warmupUseRecentFiles
      ),
      searchUseRipgrep: ws.get<boolean>('search.useRipgrep', DEFAULT_CONFIG.searchUseRipgrep),
      navigationMode,
      navigationTrackHistory: ws.get<boolean>(
        'navigation.trackHistory',
        DEFAULT_CONFIG.navigationTrackHistory
      ),
    };

    this.changeEmitter.fire(this.currentConfig);
    return this.currentConfig;
  }
}

export const configService = ConfigService.getInstance();
