import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { IndexEngine } from '../../../../src/index/engine/IndexEngine';
import { MemoryIndexStore } from '../../../../src/index/store/MemoryIndexStore';
import { stateStore } from '../../../../src/core/state/StateStore';

describe('IndexEngine', () => {
  let tempDir: string;
  let store: MemoryIndexStore;
  let engine: IndexEngine;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-engine-test-'));
    store = new MemoryIndexStore();
    await store.initialize();
    engine = new IndexEngine({ store, maxFileSizeKb: 10 });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('indexes a single file and extracts its symbols', async () => {
    const filePath = path.join(tempDir, 'sample.ts');
    fs.writeFileSync(filePath, 'export class SampleService {}', 'utf8');

    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd) => {
      if (cmd === 'vscode.executeDocumentSymbolProvider') {
        return [
          {
            name: 'SampleService',
            kind: 4,
            range: { start: { line: 0, character: 0 } },
          },
        ] as any;
      }
      return undefined;
    });

    await engine.indexFile(filePath);

    expect(await store.getFileCount()).toBe(1);
    expect(await store.getSymbolCount()).toBe(1);

    const symbols = await store.searchSymbolsByName('SampleService');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('SampleService');
  });

  it('skips files exceeding maxFileSizeKb', async () => {
    const largeFile = path.join(tempDir, 'large.ts');
    // Write 20KB (> 10KB max)
    fs.writeFileSync(largeFile, 'x'.repeat(20 * 1024), 'utf8');

    await engine.indexFile(largeFile);
    expect(await store.getFileCount()).toBe(0);
  });

  it('honors the configured maximum file size expressed in bytes', async () => {
    const filePath = path.join(tempDir, 'within-configured-limit.ts');
    fs.writeFileSync(filePath, 'x'.repeat(20 * 1024), 'utf8');

    engine.setMaxFileSizeBytes(25 * 1024);
    await engine.indexFile(filePath);

    expect(await store.getFileCount()).toBe(1);
  });

  it('indexes every eligible source file during an initial rebuild', async () => {
    for (let index = 0; index < 12; index++) {
      fs.writeFileSync(
        path.join(tempDir, `source-${index}.ts`),
        `export const value${index} = ${index};`,
        'utf8'
      );
    }

    await engine.initialize([tempDir]);

    expect(await store.getFileCount()).toBe(12);
  });

  it('removes file and symbols when removeFile is called', async () => {
    const filePath = path.join(tempDir, 'temp.ts');
    fs.writeFileSync(filePath, 'const x = 1;', 'utf8');

    await engine.indexFile(filePath);
    expect(await store.getFileCount()).toBe(1);

    await engine.removeFile(filePath);
    expect(await store.getFileCount()).toBe(0);
    expect(await store.getSymbolCount()).toBe(0);
  });

  it('supports pause, resume, and clearIndex', async () => {
    engine.pause();
    expect(stateStore.getState().indexStatus.status).toBe('paused');

    engine.resume();
    expect(stateStore.getState().indexStatus.status).toBe('idle');

    await engine.clearIndex();
    expect(await store.getFileCount()).toBe(0);
    expect(stateStore.getState().indexStatus.symbolCount).toBe(0);
  });
});
