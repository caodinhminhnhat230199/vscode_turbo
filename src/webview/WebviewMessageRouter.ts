import * as vscode from 'vscode';
import { WebviewToExtensionMessage } from './WebviewProtocol';
import { logger } from '../core/logging/Logger';

const VALID_BENCHMARK_OPS = new Set(['definition', 'references', 'workspaceSymbols', 'fileSearch']);

export class WebviewMessageRouter {
  public static async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') {
      logger.warn('Webview message dropped: not an object', { message });
      return;
    }

    const msg = message as Partial<WebviewToExtensionMessage>;
    if (typeof msg.type !== 'string') {
      logger.warn('Webview message dropped: missing type property', { message });
      return;
    }

    logger.debug('Handling webview message', { type: msg.type });

    try {
      switch (msg.type) {
        case 'REQUEST_STATE':
          // State is pushed automatically on subscription
          break;

        case 'RUN_DIAGNOSTICS':
          await vscode.commands.executeCommand('vsturbo.analyzeWorkspace');
          break;

        case 'RUN_BENCHMARK': {
          const rawOp = msg.payload?.operation;
          const op =
            typeof rawOp === 'string' && VALID_BENCHMARK_OPS.has(rawOp) ? rawOp : 'definition';
          const rawIt = msg.payload?.iterations;
          const it =
            typeof rawIt === 'number' && Number.isFinite(rawIt) && rawIt > 0 && rawIt <= 50
              ? rawIt
              : 5;
          await vscode.commands.executeCommand('vsturbo.runBenchmark', op, it);
          break;
        }

        case 'CANCEL_BENCHMARK': {
          const rawOp = msg.payload?.operation;
          const op = typeof rawOp === 'string' ? rawOp : undefined;
          await vscode.commands.executeCommand('vsturbo.cancelBenchmark', op);
          break;
        }

        case 'START_WARMUP':
          await vscode.commands.executeCommand('vsturbo.warmupProject');
          break;

        case 'PAUSE_WARMUP':
          await vscode.commands.executeCommand('vsturbo.pauseWarmup');
          break;

        case 'RESUME_WARMUP':
          await vscode.commands.executeCommand('vsturbo.resumeWarmup');
          break;

        case 'REBUILD_INDEX':
          await vscode.commands.executeCommand('vsturbo.rebuildIndex');
          break;

        case 'CLEAR_INDEX':
          await vscode.commands.executeCommand('vsturbo.clearIndex');
          break;

        case 'PAUSE_INDEX':
          await vscode.commands.executeCommand('vsturbo.pauseIndexing');
          break;

        case 'RESUME_INDEX':
          await vscode.commands.executeCommand('vsturbo.resumeIndexing');
          break;

        case 'APPLY_RECOMMENDATION': {
          const recId = msg.payload?.recommendationId;
          if (typeof recId === 'string' && recId.trim().length > 0) {
            await vscode.commands.executeCommand('vsturbo.applyRecommendation', recId.trim());
          } else {
            logger.warn('APPLY_RECOMMENDATION dropped: invalid recommendationId', {
              payload: msg.payload,
            });
          }
          break;
        }

        case 'APPLY_ALL_RECOMMENDATIONS':
          await vscode.commands.executeCommand('vsturbo.applyAllRecommendations');
          break;

        case 'UNDO_RECOMMENDATION': {
          const recId = msg.payload?.recordId;
          await vscode.commands.executeCommand(
            'vsturbo.undoRecommendation',
            typeof recId === 'string' ? recId.trim() : undefined
          );
          break;
        }

        case 'IGNORE_FINDING': {
          const findingId = msg.payload?.findingId;
          if (typeof findingId === 'string' && findingId.trim().length > 0) {
            await vscode.commands.executeCommand('vsturbo.ignoreFinding', findingId.trim());
          } else {
            logger.warn('IGNORE_FINDING dropped: invalid findingId', { payload: msg.payload });
          }
          break;
        }

        case 'OPEN_SETTINGS':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'vsturbo');
          break;

        case 'OPEN_KEYBINDINGS':
          await vscode.commands.executeCommand(
            'workbench.action.openGlobalKeybindings',
            '@ext:kcevib.vsturbo'
          );
          break;

        case 'UPDATE_CONFIG': {
          const payload = msg.payload as { key?: string; value?: unknown } | undefined;
          const rawKey = payload?.key;
          const rawVal = payload?.value;
          if (typeof rawKey === 'string') {
            const section = rawKey.startsWith('vsturbo.')
              ? rawKey.replace(/^vsturbo\./, '')
              : rawKey.startsWith('codePulse.')
                ? rawKey.replace(/^codePulse\./, '')
                : rawKey;
            await vscode.workspace
              .getConfiguration('vsturbo')
              .update(section, rawVal, vscode.ConfigurationTarget.Global);
            logger.info(`[Webview] Updated setting vsturbo.${section}`, { value: rawVal });
          }
          break;
        }

        default:
          logger.warn('Unknown webview message received', { message });
      }
    } catch (err) {
      logger.error('Error handling webview message', {
        error: String(err),
        type: msg.type,
      });
    }
  }
}
