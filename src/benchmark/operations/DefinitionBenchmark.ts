import * as vscode from 'vscode';
import { BenchmarkResult } from '../benchmarkTypes';
import { benchmarkRunner } from '../BenchmarkRunner';

export interface OperationTarget {
  uri?: vscode.Uri;
  position?: vscode.Position;
  symbolName?: string;
}

export class DefinitionBenchmark {
  public static async run(
    target?: OperationTarget,
    options: {
      iterations?: number;
      warmupIterations?: number;
      timeoutMs?: number;
      token?: any;
    } = {}
  ): Promise<BenchmarkResult> {
    let uri = target?.uri;
    let position = target?.position;
    let symbolName = target?.symbolName;

    if (!uri || !position) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        uri = editor.document.uri;
        position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position);
        if (wordRange) {
          symbolName = editor.document.getText(wordRange);
        }
      } else {
        const found = await vscode.workspace.findFiles(
          '**/*.{ts,js,py,java,go,rs,cpp,c}',
          '**/node_modules/**',
          1
        );
        if (found && found.length > 0) {
          uri = found[0];
          position = new vscode.Position(0, 0);
          symbolName = 'default';
        }
      }
    }

    if (!uri || !position) {
      throw new Error(
        'No active text editor or target position available for Definition benchmark.'
      );
    }

    return benchmarkRunner.run({
      operation: 'definition',
      iterations: options.iterations ?? 5,
      warmupIterations: options.warmupIterations ?? 1,
      timeoutMs: options.timeoutMs ?? 5000,
      token: options.token,
      targetSymbol: symbolName,
      targetUri: uri.toString(),
      execute: async () => {
        const results = await vscode.commands.executeCommand<
          vscode.Location[] | vscode.LocationLink[]
        >('vscode.executeDefinitionProvider', uri, position);

        const count = Array.isArray(results) ? results.length : results ? 1 : 0;
        return { resultCount: count };
      },
    });
  }
}
