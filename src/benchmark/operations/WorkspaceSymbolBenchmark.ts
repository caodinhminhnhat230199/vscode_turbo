import * as vscode from 'vscode';
import { BenchmarkResult } from '../benchmarkTypes';
import { benchmarkRunner } from '../BenchmarkRunner';

export class WorkspaceSymbolBenchmark {
  public static async run(
    query?: string,
    options: {
      iterations?: number;
      warmupIterations?: number;
      timeoutMs?: number;
      token?: any;
    } = {}
  ): Promise<BenchmarkResult> {
    let effectiveQuery = query?.trim();

    if (!effectiveQuery) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
        if (wordRange) {
          effectiveQuery = editor.document.getText(wordRange);
        }
      }
    }

    if (!effectiveQuery) {
      effectiveQuery = 'App'; // Default safe, representative non-empty query
    }

    return benchmarkRunner.run({
      operation: 'workspaceSymbols',
      iterations: options.iterations ?? 5,
      warmupIterations: options.warmupIterations ?? 1,
      timeoutMs: options.timeoutMs ?? 5000,
      token: options.token,
      targetSymbol: effectiveQuery,
      execute: async () => {
        const results = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider',
          effectiveQuery
        );

        const count = Array.isArray(results) ? results.length : 0;
        return { resultCount: count };
      },
    });
  }
}
