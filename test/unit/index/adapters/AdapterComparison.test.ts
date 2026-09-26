import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { adapterRegistry } from '../../../../src/index/adapters/AdapterRegistry';
import { GenericLanguageAdapter } from '../../../../src/index/adapters/GenericLanguageAdapter';

describe('P8.6: Adapter Comparison & Architectural Decoupling', () => {
  it('serves both Dart and TypeScript through the same LanguageAdapter interface', async () => {
    const dartUri = vscode.Uri.file('/workspace/lib/main.dart');
    const tsUri = vscode.Uri.file('/workspace/src/index.ts');
    const pythonUri = vscode.Uri.file('/workspace/app.py');

    const dartAdapter = adapterRegistry.getAdapter(dartUri, 'dart');
    const tsAdapter = adapterRegistry.getAdapter(tsUri, 'typescript');
    const genericAdapter = adapterRegistry.getAdapter(pythonUri, 'python');

    expect(dartAdapter.id).toBe('dart-adapter');
    expect(tsAdapter.id).toBe('typescript-adapter');
    expect(genericAdapter.id).toBe('generic-lsp-adapter');

    // Both implement the same extractSymbols method
    const dartSymbols = await dartAdapter.extractSymbols(
      dartUri,
      'f-dart',
      'void main() {}\nclass App {}'
    );
    const tsSymbols = await tsAdapter.extractSymbols(
      tsUri,
      'f-ts',
      'export function main() {}\nexport class App {}'
    );

    expect(dartSymbols.map((s) => s.name)).toEqual(['main', 'App']);
    expect(tsSymbols.map((s) => s.name)).toEqual(['main', 'App']);
  });

  it('verifies src/core and src/index/engine do not import adapter implementations', async () => {
    // Scan all files in src/core and src/index/engine
    const scanDir = (dirPath: string): string[] => {
      const results: string[] = [];
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          results.push(...scanDir(fullPath));
        } else if (entry.name.endsWith('.ts')) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const coreFiles = scanDir(path.resolve('src/core'));
    const engineFiles = scanDir(path.resolve('src/index/engine'));
    const filesToCheck = [...coreFiles, ...engineFiles];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).not.toMatch(/from\s+['"].*DartLanguageAdapter['"]/);
      expect(content).not.toMatch(/from\s+['"].*TypeScriptLanguageAdapter['"]/);
    }
  });

  it('validates capabilities contract across generic, dart, and typescript adapters', () => {
    const generic = new GenericLanguageAdapter();
    const dart = adapterRegistry.getAdapter(vscode.Uri.file('/test.dart'), 'dart');
    const ts = adapterRegistry.getAdapter(vscode.Uri.file('/test.ts'), 'typescript');

    expect(generic.capabilities.supportsSymbols).toBe(true);
    expect(generic.capabilities.supportsImports).toBe(false);

    expect(dart.capabilities.supportsSymbols).toBe(true);
    expect(dart.capabilities.supportsImports).toBe(true);
    expect(dart.capabilities.supportsDependencyGraph).toBe(true);

    expect(ts.capabilities.supportsSymbols).toBe(true);
    expect(ts.capabilities.supportsImports).toBe(true);
    expect(ts.capabilities.supportsDependencyGraph).toBe(true);
  });
});
