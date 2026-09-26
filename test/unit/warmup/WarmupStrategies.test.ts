import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ActiveFileStrategy } from '../../../src/warmup/strategies/ActiveFileStrategy';
import { EntryPointStrategy } from '../../../src/warmup/strategies/EntryPointStrategy';
import { GitChangedStrategy } from '../../../src/warmup/strategies/GitChangedStrategy';
import { RecentFilesStrategy } from '../../../src/warmup/strategies/RecentFilesStrategy';

describe('Warmup Strategies', () => {
  describe('ActiveFileStrategy', () => {
    it('discovers current active text editor file with P0 priority', async () => {
      const uri = vscode.Uri.file('/repo/src/feature.ts');
      vi.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
        document: {
          uri,
          fileName: uri.fsPath,
        },
      } as any);

      const strategy = new ActiveFileStrategy();
      const tasks = await strategy.discover();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].priority).toBe(0);
      expect(tasks[0].source).toBe('activeFile');
      expect(tasks[0].uri.fsPath).toBe(uri.fsPath);
    });

    it('returns empty array when active text editor is undefined or untitled', async () => {
      vi.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue(undefined);
      const strategy = new ActiveFileStrategy();
      const tasks = await strategy.discover();
      expect(tasks).toHaveLength(0);

      vi.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
        document: {
          uri: vscode.Uri.parse('untitled:Untitled-1'),
        },
      } as any);
      expect(await strategy.discover()).toHaveLength(0);
    });
  });

  describe('EntryPointStrategy', () => {
    it('finds entrypoint files with P1 priority', async () => {
      const mainDart = vscode.Uri.file('/flutter/lib/main.dart');
      const indexTs = vscode.Uri.file('/ts/src/index.ts');

      vi.spyOn(vscode.workspace, 'findFiles').mockImplementation(async (pattern) => {
        if (String(pattern).includes('lib/main.dart')) {
          return [mainDart];
        }
        if (String(pattern).includes('src/index.')) {
          return [indexTs];
        }
        return [];
      });

      const strategy = new EntryPointStrategy();
      const tasks = await strategy.discover();

      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks[0].priority).toBe(1);
      expect(tasks[0].source).toBe('entryPoint');
    });
  });

  describe('GitChangedStrategy', () => {
    it('discovers changed files via git extension API with P2 priority', async () => {
      const modifiedUri = vscode.Uri.file('/repo/lib/changed.dart');

      vi.spyOn(vscode.extensions, 'getExtension').mockReturnValue({
        id: 'vscode.git',
        isActive: true,
        activate: vi.fn(),
        exports: {
          getAPI: () => ({
            repositories: [
              {
                state: {
                  workingTreeChanges: [{ uri: modifiedUri }],
                  indexChanges: [],
                  untrackedChanges: [],
                },
              },
            ],
          }),
        },
      } as any);

      const strategy = new GitChangedStrategy();
      const tasks = await strategy.discover();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].priority).toBe(2);
      expect(tasks[0].source).toBe('gitChanged');
      expect(tasks[0].uri.fsPath).toBe(modifiedUri.fsPath);
    });
  });

  describe('RecentFilesStrategy', () => {
    it('tracks recently opened files and respects maxItems cap', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-recent-'));
      const f1 = path.join(tempDir, 'f1.ts');
      const f2 = path.join(tempDir, 'f2.ts');
      const f3 = path.join(tempDir, 'f3.ts');
      const f4 = path.join(tempDir, 'f4.ts');
      fs.writeFileSync(f1, '');
      fs.writeFileSync(f2, '');
      fs.writeFileSync(f3, '');
      fs.writeFileSync(f4, '');

      const strategy = new RecentFilesStrategy({ maxItems: 3 });

      strategy.recordFile(vscode.Uri.file(f1));
      strategy.recordFile(vscode.Uri.file(f2));
      strategy.recordFile(vscode.Uri.file(f3));
      strategy.recordFile(vscode.Uri.file(f4));

      const entries = strategy.getRecentEntries();
      expect(entries).toHaveLength(3);
      // Most recent should be at the front
      expect(entries[0].fsPath).toContain('f4.ts');
      expect(entries[1].fsPath).toContain('f3.ts');
      expect(entries[2].fsPath).toContain('f2.ts');

      const tasks = await strategy.discover();
      expect(tasks).toHaveLength(3);
      expect(tasks[0].priority).toBe(3);
      expect(tasks[0].source).toBe('recentFiles');

      strategy.dispose();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('ignores generated files from MRU tracking', () => {
      const strategy = new RecentFilesStrategy({ maxItems: 5 });

      strategy.recordFile(vscode.Uri.file('/repo/lib/model.g.dart'));
      strategy.recordFile(vscode.Uri.file('/repo/lib/state.freezed.dart'));
      strategy.recordFile(vscode.Uri.file('/repo/lib/normal.dart'));

      const entries = strategy.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].fsPath).toContain('normal.dart');

      strategy.dispose();
    });

    it('persists and loads entries via memento', () => {
      const mockStorage = new Map<string, any>();
      const memento: vscode.Memento = {
        get: (key: string, def?: any) => mockStorage.get(key) ?? def,
        update: async (key: string, val: any) => {
          mockStorage.set(key, val);
        },
        keys: () => Array.from(mockStorage.keys()),
      };

      const s1 = new RecentFilesStrategy({ memento });
      s1.recordFile(vscode.Uri.file('/repo/src/persisted.ts'));
      s1.dispose();

      const s2 = new RecentFilesStrategy({ memento });
      expect(s2.getRecentEntries()).toHaveLength(1);
      expect(s2.getRecentEntries()[0].fsPath).toContain('persisted.ts');
      s2.dispose();
    });
  });
});
