import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import { adapterRegistry } from '../../../src/index/adapters/AdapterRegistry';
import { DartLanguageAdapter } from '../../../src/index/adapters/DartLanguageAdapter';
import { TypeScriptLanguageAdapter } from '../../../src/index/adapters/TypeScriptLanguageAdapter';
import { GenericLanguageAdapter } from '../../../src/index/adapters/GenericLanguageAdapter';
import { IndexEngine } from '../../../src/index/engine/IndexEngine';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';

describe('P8.7 — Phase 8 Language-Specific Adapters Verification', () => {
  let store: MemoryIndexStore;

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();
    (IndexEngine.getInstance() as any).store = store;
  });

  it('P8.2: Dart symbol accuracy on real sample-flutter fixture', async () => {
    const fixturePath = path.resolve('test/fixtures/sample-flutter/lib/main.dart');
    const uri = vscode.Uri.file(fixturePath);

    const adapter = adapterRegistry.getAdapter(uri, 'dart');
    expect(adapter).toBeInstanceOf(DartLanguageAdapter);

    const symbols = await adapter.extractSymbols(uri, 'flutter-main');
    const names = symbols.map((s) => s.name);

    // main function
    expect(names).toContain('main');
    const mainSym = symbols.find((s) => s.name === 'main');
    expect(mainSym?.kind).toBe('function');
    expect(mainSym?.containerName).toBeUndefined();

    // MyApp class
    expect(names).toContain('MyApp');
    const classSym = symbols.find((s) => s.name === 'MyApp');
    expect(classSym?.kind).toBe('class');

    // build method inside MyApp
    expect(names).toContain('build');
    const buildSym = symbols.find((s) => s.name === 'build');
    expect(buildSym?.kind).toBe('method');
    expect(buildSym?.containerName).toBe('MyApp');
  });

  it('P8.3: Package-relative import resolution on sample-flutter', async () => {
    const fixturePath = path.resolve('test/fixtures/sample-flutter/lib/main.dart');
    const uri = vscode.Uri.file(fixturePath);

    const adapter = adapterRegistry.getAdapter(uri, 'dart') as DartLanguageAdapter;
    const imports = await adapter.extractImports(uri);

    expect(imports.length).toBeGreaterThanOrEqual(1);
    expect(imports[0].uri).toBe('package:flutter/material.dart');
    // Flutter SDK external package is not resolved to a local file
    expect(imports[0].resolvedPath).toBeUndefined();

    // Custom package import matching pubspec.yaml name (sample_flutter)
    const customImportContent = `import 'package:sample_flutter/widgets/header.dart';`;
    const customImports = await adapter.extractImports(uri, customImportContent);
    expect(customImports[0].resolvedPath).toBeDefined();
    expect(customImports[0].resolvedPath).toContain('sample-flutter/lib/widgets/header.dart');
  });

  it('P8.4: Dart warmup candidates prioritization', async () => {
    const fixtureDir = path.resolve('test/fixtures/sample-flutter');
    const adapter = adapterRegistry.getAdapter(vscode.Uri.file('/any.dart'), 'dart');

    const candidates = await adapter.getWarmupCandidates!(fixtureDir);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]).toContain('main.dart');
  });

  it('P8.5: TypeScript adapter indexes and extracts symbols seamlessly', async () => {
    const tsUri = vscode.Uri.file('/workspace/src/demo.ts');
    const adapter = adapterRegistry.getAdapter(tsUri, 'typescript');
    expect(adapter).toBeInstanceOf(TypeScriptLanguageAdapter);

    const tsContent = `
export class OrderService {
  public placeOrder(id: string): boolean {
    return true;
  }
}
export function getOrder(id: string): OrderService {
  return new OrderService();
}
`;
    const symbols = await adapter.extractSymbols(tsUri, 'ts-1', tsContent);
    const names = symbols.map((s) => s.name);

    expect(names).toContain('OrderService');
    expect(names).toContain('placeOrder');
    expect(names).toContain('getOrder');

    const method = symbols.find((s) => s.name === 'placeOrder');
    expect(method?.containerName).toBe('OrderService');
    expect(method?.kind).toBe('method');
  });

  it('P8.7: Capability flags safely control feature enablement', () => {
    const generic = new GenericLanguageAdapter();
    const dart = new DartLanguageAdapter();
    const ts = new TypeScriptLanguageAdapter();

    expect(generic.capabilities.supportsDependencyGraph).toBe(false);
    expect(generic.capabilities.supportsImports).toBe(false);

    expect(dart.capabilities.supportsDependencyGraph).toBe(true);
    expect(dart.capabilities.supportsImports).toBe(true);

    expect(ts.capabilities.supportsDependencyGraph).toBe(true);
    expect(ts.capabilities.supportsImports).toBe(true);
  });

  it('P8.7: IndexEngine indexes files using registered language adapters without core modification', async () => {
    const engine = IndexEngine.getInstance();
    const dartPath = path.resolve('test/fixtures/sample-flutter/lib/main.dart').replace(/\\/g, '/');

    const file = createFileRecord({
      path: dartPath,
      relativePath: 'lib/main.dart',
      size: 328,
      mtime: Date.now(),
      language: 'dart',
    });
    await store.addFile(file);

    // Call indexFile on IndexEngine directly
    await (engine as any).indexFile(dartPath);

    const symbols = await store.getSymbolsByFileId(file.id);
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols.some((s) => s.name === 'MyApp')).toBe(true);
    expect(symbols.some((s) => s.name === 'build')).toBe(true);
    expect(symbols.some((s) => s.name === 'main')).toBe(true);
  });
});
