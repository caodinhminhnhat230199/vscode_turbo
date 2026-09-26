import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PersistentIndexStore } from '../../../../src/index/store/PersistentIndexStore';
import { createFileRecord } from '../../../../src/index/models/FileRecord';
import { createSymbolRecord } from '../../../../src/index/models/SymbolRecord';

describe('PersistentIndexStore', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-test-store-'));
    dbPath = path.join(tempDir, 'index.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists records to disk and restores them on subsequent store initialization', async () => {
    const store1 = new PersistentIndexStore(dbPath);
    await store1.initialize();

    const file = createFileRecord({
      path: '/workspace/src/index.ts',
      relativePath: 'src/index.ts',
      language: 'typescript',
      size: 1500,
      mtime: 12345678,
    });
    await store1.addFile(file);

    const symbol = createSymbolRecord({
      fileId: file.id,
      name: 'bootstrap',
      kind: 'function',
      line: 12,
      column: 4,
      adapterId: 'lsp',
    });
    await store1.replaceSymbolsForFile(file.id, [symbol]);
    await store1.close();

    // Verify file actually exists on disk
    expect(fs.existsSync(dbPath)).toBe(true);

    // Reopen with new instance
    const store2 = new PersistentIndexStore(dbPath);
    await store2.initialize();

    expect(await store2.getFileCount()).toBe(1);
    expect(await store2.getSymbolCount()).toBe(1);

    const retrieved = await store2.getFileByPath('/workspace/src/index.ts');
    expect(retrieved?.id).toBe(file.id);

    const symbols = await store2.searchSymbolsByName('bootstrap');
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe('bootstrap');

    await store2.close();
  });

  it('detects database corruption and automatically recovers', async () => {
    // Write corrupted JSON into the file
    fs.writeFileSync(dbPath, '{ this is not valid JSON !!!', 'utf8');

    const store = new PersistentIndexStore(dbPath);
    await store.initialize();

    expect(store.isInitialized()).toBe(true);
    expect(await store.getFileCount()).toBe(0);

    // Verify backup corrupted file was created
    const filesInDir = fs.readdirSync(tempDir);
    const backup = filesInDir.find((f) => f.includes('.corrupted.'));
    expect(backup).toBeDefined();

    await store.close();
  });

  it('supports runTransaction batching', async () => {
    const store = new PersistentIndexStore(dbPath);
    await store.initialize();

    await store.runTransaction(async () => {
      for (let i = 0; i < 5; i++) {
        const file = createFileRecord({
          path: `/workspace/file${i}.ts`,
          relativePath: `file${i}.ts`,
          language: 'typescript',
          size: 100,
          mtime: 1000,
        });
        await store.addFile(file);
      }
    });

    expect(await store.getFileCount()).toBe(5);
    await store.close();
  });
});
