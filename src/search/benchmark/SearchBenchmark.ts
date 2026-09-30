import { benchmarkRunner } from '../../benchmark/BenchmarkRunner';
import { BenchmarkResult } from '../../benchmark/benchmarkTypes';
import { SearchCoordinator, searchCoordinator } from '../engine/SearchCoordinator';
import { SearchService, searchService } from '../SearchService';

export class SearchBenchmark {
  public static async benchmarkFileSearch(
    query = 'main',
    options?: {
      iterations?: number;
      warmupIterations?: number;
      coordinator?: SearchCoordinator;
      service?: SearchService;
    }
  ): Promise<BenchmarkResult> {
    const s = options?.service ?? (options?.coordinator ? undefined : searchService);
    const coord = options?.coordinator ?? searchCoordinator;
    return benchmarkRunner.run({
      operation: 'fileSearch',
      iterations: options?.iterations ?? 5,
      warmupIterations: options?.warmupIterations ?? 1,
      targetSymbol: query,
      execute: async () => {
        if (s) {
          const results = await s.search({ query, mode: 'file' });
          return { resultCount: results.length };
        }
        const results = await coord.fileSearchEngine.search(query);
        return { resultCount: results.length };
      },
    });
  }

  public static async benchmarkSymbolSearch(
    query = 'main',
    options?: {
      iterations?: number;
      warmupIterations?: number;
      coordinator?: SearchCoordinator;
      service?: SearchService;
    }
  ): Promise<BenchmarkResult> {
    const s = options?.service ?? (options?.coordinator ? undefined : searchService);
    const coord = options?.coordinator ?? searchCoordinator;
    return benchmarkRunner.run({
      operation: 'workspaceSymbols',
      iterations: options?.iterations ?? 5,
      warmupIterations: options?.warmupIterations ?? 1,
      targetSymbol: query,
      execute: async () => {
        if (s) {
          const results = await s.search({ query, mode: 'symbol' });
          return { resultCount: results.length };
        }
        const results = await coord.symbolSearchEngine.search(query);
        return { resultCount: results.length };
      },
    });
  }

  public static async benchmarkTextSearch(
    query = 'import',
    options?: {
      iterations?: number;
      warmupIterations?: number;
      coordinator?: SearchCoordinator;
      service?: SearchService;
    }
  ): Promise<BenchmarkResult> {
    const s = options?.service ?? (options?.coordinator ? undefined : searchService);
    const coord = options?.coordinator ?? searchCoordinator;
    return benchmarkRunner.run({
      operation: 'textSearch',
      iterations: options?.iterations ?? 5,
      warmupIterations: options?.warmupIterations ?? 1,
      targetSymbol: query,
      execute: async () => {
        if (s) {
          const results = await s.search({ query, mode: 'text' });
          return { resultCount: results.length };
        }
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
