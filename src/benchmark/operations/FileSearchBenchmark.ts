import * as vscode from 'vscode';
import { BenchmarkResult } from '../benchmarkTypes';
import { benchmarkRunner } from '../BenchmarkRunner';

export class FileSearchBenchmark {
  public static async run(
    pattern: string = '**/*',
    options: {
      iterations?: number;
      warmupIterations?: number;
      timeoutMs?: number;
      token?: any;
      maxResults?: number;
    } = {}
  ): Promise<BenchmarkResult> {
    const maxResults = options.maxResults ?? 200;

    return benchmarkRunner.run({
      operation: 'fileSearch',
      iterations: options.iterations ?? 5,
      warmupIterations: options.warmupIterations ?? 1,
      timeoutMs: options.timeoutMs ?? 5000,
      token: options.token,
      targetSymbol: pattern,
      execute: async () => {
        const results = await vscode.workspace.findFiles(pattern, undefined, maxResults);
        return { resultCount: results.length };
      },
    });
  }
}
