import { describe, it, expect, beforeEach } from 'vitest';
import { ClassSearchEngine } from '../../../src/search/engines/ClassSearchEngine';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';
import { createSymbolRecord } from '../../../src/index/models/SymbolRecord';

describe('ClassSearchEngine', () => {
  let store: MemoryIndexStore;
  let engine: ClassSearchEngine;

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();
    engine = new ClassSearchEngine(store);

    const file = createFileRecord({
      path: '/workspace/src/models.ts',
      relativePath: 'src/models.ts',
      language: 'typescript',
      size: 100,
      mtime: Date.now(),
    });
    await store.addFile(file);

    // Add a class and a function
    await store.replaceSymbolsForFile(file.id, [
      createSymbolRecord({
        fileId: file.id,
        name: 'UserService',
        kind: 'class',
        line: 10,
        column: 5,
        adapterId: 'typescript',
      }),
      createSymbolRecord({
        fileId: file.id,
        name: 'getUserService',
        kind: 'function',
        line: 25,
        column: 0,
        adapterId: 'typescript',
      }),
    ]);
  });

  it('finds class symbols and ignores plain functions', async () => {
    const results = await engine.search('UserService');
    expect(results.length).toBe(1);
    expect(results[0].label).toBe('UserService');
    expect(results[0].category).toBe('class');
  });
});
