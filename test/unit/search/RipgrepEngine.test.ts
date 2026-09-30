import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseVimgrepLine, RipgrepEngine } from '../../../src/search/engine/RipgrepEngine';

describe('RipgrepEngine', () => {
  let tempDir: string;
  let engine: RipgrepEngine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-rg-'));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules'), { recursive: true });

    // Valid file
    fs.writeFileSync(
      path.join(tempDir, 'src', 'greeter.ts'),
      'export function helloWorld() {\n  return "Hello CodePulse!";\n}\n'
    );

    // File in excluded directory
    fs.writeFileSync(
      path.join(tempDir, 'node_modules', 'dep.ts'),
      '// should be excluded: Hello CodePulse!\n'
    );

    engine = new RipgrepEngine();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds text matches within non-excluded files', async () => {
    const results = await engine.search('Hello CodePulse', {
      workspaceRoots: [tempDir],
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].category).toBe('text');
    expect(results[0].lineText).toContain('Hello CodePulse!');
    expect(results[0].line).toBe(1); // 0-indexed line 1
    expect(results[0].column).toBeGreaterThanOrEqual(0);

    // Verify node_modules was ignored
    const hasDep = results.some((r) => r.uri.fsPath.includes('node_modules'));
    expect(hasDep).toBe(false);
  });

  it('respects limit parameter', async () => {
    const results = await engine.search('Hello', {
      workspaceRoots: [tempDir],
      limit: 1,
    });

    expect(results).toHaveLength(1);
  });

  it('handles cancellation gracefully', async () => {
    const cts = new vscode.CancellationTokenSource();
    cts.cancel(); // immediately cancelled

    const results = await engine.search('Hello', {
      workspaceRoots: [tempDir],
      cancellationToken: cts.token,
    });

    expect(results).toHaveLength(0);
  });

  it('parses absolute Windows paths emitted by rg --vimgrep', () => {
    const parsed = parseVimgrepLine(
      'D:\\workspace\\src\\UserService.ts:7:14:export class UserService {'
    );

    expect(parsed).toEqual({
      filePath: 'D:\\workspace\\src\\UserService.ts',
      line: 7,
      column: 14,
      lineText: 'export class UserService {',
    });
  });
});
