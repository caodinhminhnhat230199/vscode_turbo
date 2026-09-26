import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PredictiveWarmupStrategy } from '../../../src/warmup/strategies/PredictiveWarmupStrategy';
import { dependencyGraph } from '../../../src/graph/DependencyGraph';

describe('P9.5 — PredictiveWarmupStrategy', () => {
  let strategy: PredictiveWarmupStrategy;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-pred-warmup-'));
    strategy = new PredictiveWarmupStrategy({ maxDepth: 2, limit: 5 });
    dependencyGraph.clear();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('discovers and prioritizes neighbors of active editor file', async () => {
    const activePath = path.join(tempDir, 'active.ts');
    const dep1Path = path.join(tempDir, 'dep1.ts');
    const dep2Path = path.join(tempDir, 'dep2.ts');

    fs.writeFileSync(activePath, 'export const a = 1;');
    fs.writeFileSync(dep1Path, 'export const b = 2;');
    fs.writeFileSync(dep2Path, 'export const c = 3;');

    const normActive = activePath.replace(/\\/g, '/');
    const normDep1 = dep1Path.replace(/\\/g, '/');
    const normDep2 = dep2Path.replace(/\\/g, '/');

    // Mock active text editor
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: vscode.Uri.file(activePath),
      },
    };

    dependencyGraph.addEdge({
      from: normActive,
      to: normDep1,
      type: 'import',
      weight: 2,
    });
    dependencyGraph.addEdge({
      from: normDep1,
      to: normDep2,
      type: 'import',
      weight: 1,
    });

    const tasks = await strategy.discover();

    expect(tasks).toHaveLength(2);
    expect(tasks[0].uri.fsPath.replace(/\\/g, '/')).toBe(normDep1);
    expect(tasks[0].source).toBe('predictive');
    // Direct dependency (dist 1) has higher precedence than transitive (dist 2)
    expect(tasks[0].priority).toBeLessThanOrEqual(tasks[1].priority);
  });

  it('returns empty list when there is no active text editor', async () => {
    (vscode.window as any).activeTextEditor = undefined;

    const tasks = await strategy.discover();
    expect(tasks).toHaveLength(0);
  });

  it('respects cancellation token during discovery', async () => {
    const tokenSource = new vscode.CancellationTokenSource();
    tokenSource.cancel();

    const tasks = await strategy.discover({ cancellationToken: tokenSource.token });
    expect(tasks).toHaveLength(0);
  });
});
