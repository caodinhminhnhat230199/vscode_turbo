import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { DiagnosticEngine } from '../../../src/diagnostics/DiagnosticEngine';
import { DiagnosticRule } from '../../../src/diagnostics/rules/ruleTypes';
import { WebviewMessageRouter } from '../../../src/webview/WebviewMessageRouter';
import { PersistentIndexStore } from '../../../src/index/store/PersistentIndexStore';
import { isWorkspaceTrusted } from '../../../src/vscode/workspaceTrust';
import { RipgrepEngine } from '../../../src/search/engine/RipgrepEngine';
import { GitChangedStrategy } from '../../../src/warmup/strategies/GitChangedStrategy';
import { IndexEngine } from '../../../src/index/engine/IndexEngine';
import { activate, deactivate } from '../../../src/extension';

describe('Phase 10: Product Hardening & Enterprise Security', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-phase10-'));
    (vscode.workspace as unknown as { _setIsTrusted: (t: boolean) => void })._setIsTrusted(true);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('P10.1 Error Boundaries & Diagnostic Isolation', () => {
    it('isolates failing diagnostic rules and preserves results from healthy rules', () => {
      const failingRule: DiagnosticRule = {
        id: 'RULE_FAILING',
        name: 'Failing Rule',
        evaluate: () => {
          throw new Error('Simulated crash inside rule');
        },
      };

      const healthyRule: DiagnosticRule = {
        id: 'RULE_HEALTHY',
        name: 'Healthy Rule',
        evaluate: () => [
          {
            id: 'healthy-finding',
            category: 'workspace',
            title: 'Healthy finding',
            severity: 'medium',
            confidence: 'high',
            summary: 'Healthy rule succeeded',
            evidence: [],
            createdAt: Date.now(),
          },
        ],
      };

      const engine = new DiagnosticEngine([failingRule, healthyRule]);
      const findings = engine.analyze({
        scanResult: {
          rootPath: tempDir,
          totalFiles: 1,
          totalDirectories: 1,
          totalSizeBytes: 100,
          maxDepth: 1,
          extensionDistribution: {},
          largestFiles: [],
          detectedBuildFolders: [],
          durationMs: 1,
          truncated: false,
        },
        excludes: {
          filesExclude: { effective: {}, activePatterns: [] },
          watcherExclude: { effective: {}, activePatterns: [] },
          searchExclude: { effective: {}, activePatterns: [] },
        },
        generatedSourceCount: 0,
      });

      expect(findings).toHaveLength(1);
      expect(findings[0].id).toBe('healthy-finding');
    });

    it('validates webview messages and ignores invalid or corrupt payloads', async () => {
      const execSpy = vi.spyOn(vscode.commands, 'executeCommand');

      // 1. null / primitive message
      await WebviewMessageRouter.handleMessage(null);
      await WebviewMessageRouter.handleMessage('string-message');
      await WebviewMessageRouter.handleMessage({ missingType: true });

      // 2. valid message with sanitized values
      await WebviewMessageRouter.handleMessage({
        type: 'RUN_BENCHMARK',
        payload: { operation: 'definition', iterations: 10 },
      });
      expect(execSpy).toHaveBeenCalledWith('codePulse.runBenchmark', 'definition', 10);

      // 3. out-of-range benchmark iterations clamped to default 5
      await WebviewMessageRouter.handleMessage({
        type: 'RUN_BENCHMARK',
        payload: { operation: 'invalid-op', iterations: 999999 },
      });
      expect(execSpy).toHaveBeenCalledWith('codePulse.runBenchmark', 'definition', 5);

      // 4. empty recommendation ID ignored
      await WebviewMessageRouter.handleMessage({
        type: 'APPLY_RECOMMENDATION',
        payload: { recommendationId: '' },
      });

      execSpy.mockRestore();
    });
  });

  describe('P10.2 Database Recovery & Corruption Self-Healing', () => {
    it('detects corrupt JSON database, creates backup, and initializes clean database', async () => {
      const dbPath = path.join(tempDir, 'corrupt-index.json');
      fs.writeFileSync(dbPath, '{ this is corrupted invalid json content !!!', 'utf8');

      const store = new PersistentIndexStore(dbPath);
      await store.initialize();

      expect(store.isInitialized()).toBe(true);
      const count = await store.getSymbolCount();
      expect(count).toBe(0);

      // Verify backup file was created
      const dirFiles = fs.readdirSync(tempDir);
      const backupFile = dirFiles.find((f) => f.includes('.corrupted.'));
      expect(backupFile).toBeDefined();

      await store.close();
    });
  });

  describe('P10.3 & P10.5 Workspace Trust & Process Security', () => {
    it('reports workspace trust accurately via isWorkspaceTrusted', () => {
      expect(isWorkspaceTrusted()).toBe(true);

      (vscode.workspace as unknown as { _setIsTrusted: (t: boolean) => void })._setIsTrusted(false);
      expect(isWorkspaceTrusted()).toBe(false);
    });

    it('falls back to pure Node regex search when workspace is untrusted', async () => {
      const testFile = path.join(tempDir, 'sample.ts');
      fs.writeFileSync(testFile, 'export const secretToken = "alpha123";', 'utf8');

      (vscode.workspace as unknown as { _setIsTrusted: (t: boolean) => void })._setIsTrusted(false);

      const engine = new RipgrepEngine();
      const results = await engine.search('secretToken', {
        workspaceRoots: [tempDir],
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].lineText).toContain('secretToken');
    });

    it('skips Git CLI execution when workspace is untrusted', async () => {
      (vscode.workspace as unknown as { _setIsTrusted: (t: boolean) => void })._setIsTrusted(false);

      const strategy = new GitChangedStrategy();
      const tasks = await strategy.discover({
        workspaceFolders: [{ uri: vscode.Uri.file(tempDir), name: 'temp', index: 0 }],
      });

      expect(tasks).toEqual([]);
    });

    it('validates binary paths and kills child processes cleanly', () => {
      expect(RipgrepEngine.isValidBinary('')).toBe(false);
      expect(RipgrepEngine.isValidBinary(tempDir)).toBe(false); // directory, not file
      expect(RipgrepEngine.isValidBinary(path.join(tempDir, 'nonexistent.exe'))).toBe(false);

      const dummyFile = path.join(tempDir, 'dummy.exe');
      fs.writeFileSync(dummyFile, 'bin');
      expect(RipgrepEngine.isValidBinary(dummyFile)).toBe(true);

      // Verify killAllProcesses does not throw
      expect(() => RipgrepEngine.killAllProcesses()).not.toThrow();
    });
  });

  describe('P10.6 & P10.7 Performance Budget & Extension Disposal', () => {
    it('activates within 50ms performance budget', () => {
      const subscriptions: vscode.Disposable[] = [];
      const mockContext = {
        subscriptions,
        extensionUri: vscode.Uri.file(tempDir),
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
      } as unknown as vscode.ExtensionContext;

      const t0 = performance.now();
      activate(mockContext);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(50);
      expect(subscriptions.length).toBeGreaterThan(4);
    });

    it('cleans up resources and child processes on deactivate', () => {
      expect(() => deactivate()).not.toThrow();
    });

    it('disposes IndexEngine cleanly without leaks', async () => {
      const store = new PersistentIndexStore(path.join(tempDir, 'dispose-test.json'));
      await store.initialize();
      const engine = new IndexEngine({ store });

      await expect(engine.dispose()).resolves.not.toThrow();
    });
  });
});
