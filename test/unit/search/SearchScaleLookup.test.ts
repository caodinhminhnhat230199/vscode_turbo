import { describe, it, expect } from 'vitest';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { FileSearchEngine } from '../../../src/search/engine/FileSearchEngine';
import { SymbolSearchEngine } from '../../../src/search/engine/SymbolSearchEngine';
import { RankingEngine } from '../../../src/search/ranking/RankingEngine';
import { createFileRecord } from '../../../src/index/models/FileRecord';
import { SymbolRecord } from '../../../src/index/models/SymbolRecord';

describe('Search Candidate Lookup Scale Test (10k/50k Records)', () => {
  it('handles 10k files and 50k symbols without full scan and keeps exact name dominant', async () => {
    const store = new MemoryIndexStore();
    await store.initialize();

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();

    // 1. Generate 10,000 files
    const fileCount = 10000;
    for (let i = 0; i < fileCount; i++) {
      const fileName = i === 42 ? 'ExactTargetFile.ts' : `File_${i}.ts`;
      const filePath = `/project/src/sub_${i % 50}/${fileName}`;
      await store.addFile(
        createFileRecord({
          id: `f_${i}`,
          path: filePath,
          relativePath: `src/sub_${i % 50}/${fileName}`,
          language: 'typescript',
          size: 1024,
          mtime: Date.now(),
        })
      );
    }

    // 2. Generate 50,000 symbols across files (5 per file)
    for (let i = 0; i < fileCount; i++) {
      const fileId = `f_${i}`;
      const syms: SymbolRecord[] = [];
      for (let s = 0; s < 5; s++) {
        const symIdx = i * 5 + s;
        const symName = symIdx === 42 ? 'ExactTargetSymbol' : `Symbol_${symIdx}`;
        syms.push({
          id: `s_${symIdx}`,
          fileId,
          adapterId: 'test',
          name: symName,
          kind: 'function',
          line: 10,
          column: 4,
        });
      }
      await store.replaceSymbolsForFile(fileId, syms);
    }

    const populationTime = performance.now() - t0;
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = (memAfter - memBefore) / 1024 / 1024;

    // Report memory and setup metrics
    // eslint-disable-next-line no-console
    console.log(
      `[ScaleReport] Populated 10k files & 50k symbols in ${populationTime.toFixed(1)}ms. Heap delta: ${memDeltaMb.toFixed(2)}MB`
    );

    const fileEngine = new FileSearchEngine(() => store);
    const symbolEngine = new SymbolSearchEngine(() => store);

    // 3. Search exact file target on 10k files
    const tFileStart = performance.now();
    const fileResults = await fileEngine.search('ExactTargetFile');
    const fileDurationMs = performance.now() - tFileStart;

    expect(fileResults.length).toBeGreaterThan(0);
    expect(fileResults[0].label).toBe('ExactTargetFile.ts');
    expect(fileDurationMs).toBeLessThan(50); // P95 target < 50ms

    // 4. Search exact symbol target on 50k symbols
    const tSymStart = performance.now();
    const symResults = await symbolEngine.search('ExactTargetSymbol');
    const symDurationMs = performance.now() - tSymStart;

    expect(symResults.length).toBeGreaterThan(0);
    expect(symResults[0].label).toBe('ExactTargetSymbol');
    expect(symDurationMs).toBeLessThan(50); // P95 target < 50ms

    // 5. Verify exact name dominance in RankingEngine over recency/fuzzy
    const ranked = RankingEngine.rank(
      [
        {
          id: 'fuzzy_recent',
          label: 'ExactTargetSymbolHelper',
          name: 'ExactTargetSymbolHelper',
          kind: 'function',
          line: 1,
          column: 0,
          category: 'symbol',
          score: 500,
          uri: {
            fsPath: '/project/src/sub_0/File_0.ts',
            path: '/project/src/sub_0/File_0.ts',
          } as any,
        },
        {
          id: 'exact',
          label: 'ExactTargetSymbol',
          name: 'ExactTargetSymbol',
          kind: 'function',
          line: 1,
          column: 0,
          category: 'symbol',
          score: 500,
          uri: {
            fsPath: '/project/src/sub_1/File_1.ts',
            path: '/project/src/sub_1/File_1.ts',
          } as any,
        },
      ],
      'ExactTargetSymbol',
      {
        recentlyOpenedPaths: new Set(['/project/src/sub_0/File_0.ts']),
      }
    );

    // Exact name MUST be ranked 1st despite the other item having recency bonus
    expect(ranked[0].id).toBe('exact');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});
