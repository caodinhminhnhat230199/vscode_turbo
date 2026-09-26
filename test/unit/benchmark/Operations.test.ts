import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { DefinitionBenchmark } from '../../../src/benchmark/operations/DefinitionBenchmark';
import { ReferencesBenchmark } from '../../../src/benchmark/operations/ReferencesBenchmark';
import { WorkspaceSymbolBenchmark } from '../../../src/benchmark/operations/WorkspaceSymbolBenchmark';
import { FileSearchBenchmark } from '../../../src/benchmark/operations/FileSearchBenchmark';

describe('Benchmark Operations', () => {
  it('executes DefinitionBenchmark with target and returns valid BenchmarkResult', async () => {
    const mockUri = vscode.Uri.file('/workspace/src/index.ts');
    const mockPos = new vscode.Position(10, 5);

    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd, ..._args) => {
      if (cmd === 'vscode.executeDefinitionProvider') {
        return [{ uri: mockUri, range: {} } as any];
      }
      return undefined;
    });

    const result = await DefinitionBenchmark.run(
      { uri: mockUri, position: mockPos, symbolName: 'myFunc' },
      { iterations: 2, warmupIterations: 1 }
    );

    expect(result.operation).toBe('definition');
    expect(result.sampleCount).toBe(2);
    expect(result.targetSymbol).toBe('myFunc');
    expect(result.samples).toHaveLength(3); // 1 warmup + 2 measured
  });

  it('executes ReferencesBenchmark with target and returns valid BenchmarkResult', async () => {
    const mockUri = vscode.Uri.file('/workspace/src/index.ts');
    const mockPos = new vscode.Position(12, 4);

    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd, ..._args) => {
      if (cmd === 'vscode.executeReferenceProvider') {
        return [
          { uri: mockUri, range: {} },
          { uri: mockUri, range: {} },
        ] as any;
      }
      return undefined;
    });

    const result = await ReferencesBenchmark.run(
      { uri: mockUri, position: mockPos, symbolName: 'User' },
      { iterations: 2, warmupIterations: 1 }
    );

    expect(result.operation).toBe('references');
    expect(result.sampleCount).toBe(2);
    expect(result.targetSymbol).toBe('User');
  });

  it('executes WorkspaceSymbolBenchmark with query and returns valid BenchmarkResult', async () => {
    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd, ..._args) => {
      if (cmd === 'vscode.executeWorkspaceSymbolProvider') {
        return [{ name: 'AppService', containerName: '' } as any];
      }
      return undefined;
    });

    const result = await WorkspaceSymbolBenchmark.run('AppService', {
      iterations: 2,
      warmupIterations: 0,
    });

    expect(result.operation).toBe('workspaceSymbols');
    expect(result.sampleCount).toBe(2);
    expect(result.targetSymbol).toBe('AppService');
  });

  it('executes FileSearchBenchmark and returns valid BenchmarkResult', async () => {
    vi.spyOn(vscode.workspace, 'findFiles' as any).mockImplementation(async () => [
      vscode.Uri.file('/workspace/file1.ts'),
      vscode.Uri.file('/workspace/file2.ts'),
    ]);

    const result = await FileSearchBenchmark.run('**/*.ts', {
      iterations: 2,
      warmupIterations: 0,
    });

    expect(result.operation).toBe('fileSearch');
    expect(result.sampleCount).toBe(2);
    expect(result.targetSymbol).toBe('**/*.ts');
  });
});
