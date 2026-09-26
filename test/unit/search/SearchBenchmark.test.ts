import { describe, it, expect, beforeEach } from 'vitest';
import { SearchBenchmark } from '../../../src/search/benchmark/SearchBenchmark';
import { SearchCoordinator } from '../../../src/search/engine/SearchCoordinator';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';
import { createSymbolRecord } from '../../../src/index/models/SymbolRecord';

describe('SearchBenchmark', () => {
  let store: MemoryIndexStore;
  let coordinator: SearchCoordinator;

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();

    await store.addFile(
      createFileRecord({
        path: '/workspace/lib/main.dart',
        relativePath: 'lib/main.dart',
        language: 'dart',
        size: 100,
        mtime: Date.now(),
      })
    );

    await store.replaceSymbolsForFile('/workspace/lib/main.dart', [
      createSymbolRecord({
        fileId: '/workspace/lib/main.dart',
        name: 'main',
        kind: 'function',
        line: 1,
        column: 0,
        adapterId: 'test',
      }),
    ]);

    coordinator = new SearchCoordinator(store);
  });

  it('benchmarks file search and calculates P50/P95 latencies', async () => {
    const result = await SearchBenchmark.benchmarkFileSearch('main', {
      iterations: 3,
      warmupIterations: 1,
      coordinator,
    });

    expect(result.operation).toBe('fileSearch');
    expect(result.sampleCount).toBe(3);
    expect(result.p50Ms).toBeGreaterThanOrEqual(0);
    expect(result.p95Ms).toBeGreaterThanOrEqual(result.p50Ms);
  });

  it('benchmarks symbol search and calculates P50/P95 latencies', async () => {
    const result = await SearchBenchmark.benchmarkSymbolSearch('main', {
      iterations: 3,
      warmupIterations: 1,
      coordinator,
    });

    expect(result.operation).toBe('workspaceSymbols');
    expect(result.sampleCount).toBe(3);
    expect(result.p50Ms).toBeGreaterThanOrEqual(0);
  });

  it('runs complete search benchmark suite', async () => {
    const results = await SearchBenchmark.runSuite('main', coordinator);

    expect(results).toHaveLength(3);
    expect(results[0].operation).toBe('fileSearch');
    expect(results[1].operation).toBe('workspaceSymbols');
    expect(results[2].operation).toBe('textSearch');
  });
});
