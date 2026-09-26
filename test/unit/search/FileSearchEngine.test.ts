import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { FileSearchEngine } from '../../../src/search/engine/FileSearchEngine';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';

describe('FileSearchEngine', () => {
  let store: MemoryIndexStore;
  let engine: FileSearchEngine;

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();

    await store.addFile(
      createFileRecord({
        path: '/workspace/src/main.ts',
        relativePath: 'src/main.ts',
        language: 'typescript',
        size: 100,
        mtime: Date.now(),
      })
    );

    await store.addFile(
      createFileRecord({
        path: '/workspace/src/models/user.ts',
        relativePath: 'src/models/user.ts',
        language: 'typescript',
        size: 150,
        mtime: Date.now(),
      })
    );

    await store.addFile(
      createFileRecord({
        path: '/workspace/src/models/order.ts',
        relativePath: 'src/models/order.ts',
        language: 'typescript',
        size: 120,
        mtime: Date.now(),
      })
    );

    await store.addFile(
      createFileRecord({
        path: '/workspace/test/unit/user.test.ts',
        relativePath: 'test/unit/user.test.ts',
        language: 'typescript',
        size: 200,
        mtime: Date.now(),
      })
    );

    engine = new FileSearchEngine(store);
  });

  it('ranks exact filename match highest', async () => {
    const results = await engine.search('user.ts');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fileName).toBe('user.ts');
    expect(results[0].relativePath).toBe('src/models/user.ts');
    expect(results[0].score).toBeGreaterThan(800);
  });

  it('supports prefix match on filename', async () => {
    const results = await engine.search('use');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fileName).toBe('user.ts');
  });

  it('supports path substring match', async () => {
    const results = await engine.search('models');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.relativePath)).toContain('src/models/user.ts');
    expect(results.map((r) => r.relativePath)).toContain('src/models/order.ts');
  });

  it('supports fuzzy matching', async () => {
    const results = await engine.search('utest');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fileName).toBe('user.test.ts');
  });

  it('applies active file neighborhood bonus', async () => {
    const activeFileUri = vscode.Uri.file('/workspace/src/models/active.ts');
    const results = await engine.search('ts', { activeFileUri });

    // Files in /workspace/src/models/ should get +50 neighborhood bonus
    const userModel = results.find((r) => r.relativePath === 'src/models/user.ts');
    const mainFile = results.find((r) => r.relativePath === 'src/main.ts');

    expect(userModel).toBeDefined();
    expect(mainFile).toBeDefined();
    expect(userModel!.score).toBeGreaterThan(mainFile!.score);
  });

  it('respects limit option', async () => {
    const results = await engine.search('ts', { limit: 2 });
    expect(results).toHaveLength(2);
  });
});
