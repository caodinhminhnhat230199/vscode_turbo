import { benchmarkRunner } from '../../benchmark/BenchmarkRunner';
import { BenchmarkResult } from '../../benchmark/benchmarkTypes';
import { SearchCoordinator, searchCoordinator } from '../engine/SearchCoordinator';

export class SearchBenchmark {
  public static async benchmarkFileSearch(
    query = 'main',
    options?: { iterations?: number; warmupIterations?: number; coordinator?: SearchCoordinator }
  ): Promise<BenchmarkResult> {
    const coord = options?.coordinator ?? searchCoordinator;
    return benchmarkRunner.run({
      operation: 'fileSearch',
      iterations: options?.iterations ?? 5,
      warmupIterations: options?.warmupIterations ?? 1,
      targetSymbol: query,
      execute: async () => {
        const results = await coord.fileSearchEngine.search(query);
        return { resultCount: results.length };
      },
    });
  }

  public static async benchmarkSymbolSearch(
    query = 'main',
    options?: { iterations?: number; warmupIterations?: number; coordinator?: SearchCoordinator }
  ): Promise<BenchmarkResult> {
    const coord = options?.coordinator ?? searchCoordinator;
    return benchmarkRunner.run({
      operation: 'workspaceSymbols',
      iterations: options?.iterations ?? 5,
      warmupIterations: options?.warmupIterations ?? 1,
      targetSymbol: query,
      execute: async () => {
        const results = await coord.symbolSearchEngine.search(query);
        return { resultCount: results.length };
      },
    });
  }

  public static async benchmarkTextSearch(
    query = 'import',
    options?: { iterations?: number; warmupIterations?: number; coordinator?: SearchCoordinator }
  ): Promise<BenchmarkResult> {
    const coord = options?.coordinator ?? searchCoordinator;
    return benchmarkRunner.run({
      operation: 'textSearch',
      iterations: options?.iterations ?? 5,
      warmupIterations: options?.warmupIterations ?? 1,
      targetSymbol: query,
      execute: async () => {
        const results = await coord.ripgrepEngine.search(query);
        return { resultCount: results.length };
      },
    });
  }

  public static async runSuite(
    query = 'main',
    coordinator = searchCoordinator
  ): Promise<BenchmarkResult[]> {
    const fileRes = await SearchBenchmark.benchmarkFileSearch(query, { coordinator });
    const symRes = await SearchBenchmark.benchmarkSymbolSearch(query, { coordinator });
    const textRes = await SearchBenchmark.benchmarkTextSearch(query, { coordinator });
    return [fileRes, symRes, textRes];
  }
}
