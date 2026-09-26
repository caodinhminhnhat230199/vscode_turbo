import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryIndexStore } from '../../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../../src/index/models/FileRecord';
import { createSymbolRecord } from '../../../../src/index/models/SymbolRecord';

describe('MemoryIndexStore', () => {
  let store: MemoryIndexStore;

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();
  });

  it('performs file CRUD operations', async () => {
    const file = createFileRecord({
      path: '/workspace/src/app.ts',
      relativePath: 'src/app.ts',
      language: 'typescript',
      size: 200,
      mtime: 1000,
    });

    await store.addFile(file);
    expect(await store.getFileCount()).toBe(1);

    const retrieved = await store.getFileById(file.id);
    expect(retrieved?.path).toBe('/workspace/src/app.ts');

    const byPath = await store.getFileByPath('/workspace/src/app.ts');
    expect(byPath?.id).toBe(file.id);

    await store.deleteFile(file.id);
    expect(await store.getFileCount()).toBe(0);
    expect(await store.getFileById(file.id)).toBeUndefined();
  });

  it('ranks symbol searches deterministically: exact > prefix > length > alphabetical', async () => {
    const file = createFileRecord({
      path: '/workspace/src/symbols.ts',
      relativePath: 'src/symbols.ts',
      language: 'typescript',
      size: 500,
      mtime: 1000,
    });
    await store.addFile(file);

    const symbols = [
      createSymbolRecord({
        fileId: file.id,
        name: 'user',
        kind: 'variable',
        line: 1,
        column: 0,
        adapterId: 'test',
      }),
      createSymbolRecord({
        fileId: file.id,
        name: 'User',
        kind: 'class',
        line: 5,
        column: 0,
        adapterId: 'test',
      }),
      createSymbolRecord({
        fileId: file.id,
        name: 'UserProfile',
        kind: 'interface',
        line: 10,
        column: 0,
        adapterId: 'test',
      }),
      createSymbolRecord({
        fileId: file.id,
        name: 'getUserById',
        kind: 'function',
        line: 20,
        column: 0,
        adapterId: 'test',
      }),
      createSymbolRecord({
        fileId: file.id,
        name: 'UserService',
        kind: 'class',
        line: 30,
        column: 0,
        adapterId: 'test',
      }),
    ];

    await store.replaceSymbolsForFile(file.id, symbols);

    const results = await store.searchSymbolsByName('user');
    expect(results.length).toBe(5);

    // Exact matches first (User / user)
    expect(results[0].name.toLowerCase()).toBe('user');
    expect(results[1].name.toLowerCase()).toBe('user');

    // Prefix matches next (UserProfile / UserService) - 'P' before 'S'
    expect(results[2].name).toBe('UserProfile');
    expect(results[3].name).toBe('UserService');

    // Substring match last (getUserById)
    expect(results[4].name).toBe('getUserById');
  });

  it('executes in transactions and returns stats', async () => {
    await store.runTransaction(async () => {
      const file = createFileRecord({
        path: '/workspace/f1.ts',
        relativePath: 'f1.ts',
        language: 'typescript',
        size: 100,
        mtime: 100,
      });
      await store.addFile(file);
      await store.replaceSymbolsForFile(file.id, [
        createSymbolRecord({
          fileId: file.id,
          name: 'fn',
          kind: 'function',
          line: 1,
          column: 0,
          adapterId: 'test',
        }),
      ]);
    });

    const stats = await store.getStats();
    expect(stats.fileCount).toBe(1);
    expect(stats.symbolCount).toBe(1);
    expect(stats.schemaVersion).toBe(1);

    await store.clear();
    expect(await store.getFileCount()).toBe(0);
    expect(await store.getSymbolCount()).toBe(0);
  });
});
