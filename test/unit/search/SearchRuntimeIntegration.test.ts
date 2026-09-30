import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { indexEngine } from '../../../src/index/engine/IndexEngine';
import { SearchService } from '../../../src/search/SearchService';
import { searchController } from '../../../src/search/SearchController';
import { searchCoordinator } from '../../../src/search/engine/SearchCoordinator';
import { projectIndexService } from '../../../src/index/ProjectIndexService';
import { RipgrepEngine } from '../../../src/search/engine/RipgrepEngine';
import { SearchResult } from '../../../src/search/models/SearchResult';

describe('Search Runtime Integration Regression Harness', () => {
  let tempStorageDir: string;
  const fixtureRoot = path.resolve(__dirname, '../../fixtures/search-workspace');

  beforeEach(() => {
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-search-test-'));
    indexEngine.resume();
  });

  afterEach(async () => {
    await indexEngine.dispose();
    indexEngine.resume();
    fs.rmSync(tempStorageDir, { recursive: true, force: true });
    (
      vscode.workspace as unknown as {
        _setWorkspaceFolders: (folders: undefined) => void;
      }
    )._setWorkspaceFolders(undefined);
  });

  it('proves fixture contains valid class, symbol, file, and text targets', async () => {
    const userServicePath = path.join(fixtureRoot, 'src', 'UserService.ts');
    const guidePath = path.join(fixtureRoot, 'docs', 'guide.md');

    expect(fs.existsSync(userServicePath)).toBe(true);
    expect(fs.existsSync(guidePath)).toBe(true);

    const userContent = fs.readFileSync(userServicePath, 'utf8');
    const guideContent = fs.readFileSync(guidePath, 'utf8');

    expect(userContent).toContain('export class UserService');
    expect(userContent).toContain('public findUserById');
    expect(guideContent).toContain('UNIQUE_TEXT_NEEDLE_42');

    // Verify 0-based lines
    const userLines = userContent.split(/\r?\n/);
    const classLine = userLines.findIndex((l) => l.includes('export class UserService'));
    const methodLine = userLines.findIndex((l) => l.includes('public findUserById'));
    expect(classLine).toBe(6);
    expect(methodLine).toBe(7);

    const guideLines = guideContent.split(/\r?\n/);
    const textLine = guideLines.findIndex((l) => l.includes('UNIQUE_TEXT_NEEDLE_42'));
    expect(textLine).toBe(3);
  });

  it('reproduces stale store bug when IndexEngine is configured after SearchService creation', async () => {
    // SearchService instantiated before configure()
    const searchService = new SearchService();

    indexEngine.configure({
      storageDir: tempStorageDir,
    });
    await projectIndexService.initialize([fixtureRoot]);

    // Query for class indexed into the persistent store
    const classResults = await searchService.search({
      query: 'UserService',
      mode: 'class',
      options: {
        workspaceRoots: [fixtureRoot],
      },
    });

    // Query for symbol indexed into the persistent store
    const symbolResults = await searchService.search({
      query: 'findUserById',
      mode: 'symbol',
      options: {
        workspaceRoots: [fixtureRoot],
      },
    });

    // On unpatched code, these return 0 because searchService engines are bound to the old MemoryIndexStore
    expect(classResults.length).toBeGreaterThan(0);
    expect(symbolResults.length).toBeGreaterThan(0);
  });

  it('verifies ripgrep text engine finds target with 0-based line/column', async () => {
    const ripgrep = new RipgrepEngine();
    const results = await ripgrep.search('UNIQUE_TEXT_NEEDLE_42', {
      workspaceRoots: [fixtureRoot],
    });

    expect(results.length).toBe(1);
    expect(results[0].line).toBe(3);
    expect(results[0].column).toBeGreaterThanOrEqual(0);
    expect(results[0].uri.fsPath.replace(/\\/g, '/')).toContain('docs/guide.md');
  });

  it('demonstrates need for explicit readiness states (indexing vs ready vs disabled)', async () => {
    // ProjectIndexService readiness contract test
    const readiness = (projectIndexService as any).getReadiness?.() ?? 'unsupported';
    expect(['idle', 'indexing', 'ready', 'disabled', 'error']).toContain(readiness);
  });

  it('verifies filters (ext, kind, path) work accurately', async () => {
    const searchService = new SearchService();
    indexEngine.configure({
      storageDir: tempStorageDir,
    });
    await projectIndexService.initialize([fixtureRoot]);

    // 1. ext filter
    const tsFiles = await searchService.search({
      query: 'UserService ext:ts',
      mode: 'file',
      options: { workspaceRoots: [fixtureRoot] },
    });
    expect(tsFiles.length).toBeGreaterThan(0);

    const dartFiles = await searchService.search({
      query: 'UserService ext:dart',
      mode: 'file',
      options: { workspaceRoots: [fixtureRoot] },
    });
    expect(dartFiles.length).toBe(0);

    // 2. kind filter
    const methodSymbols = await searchService.search({
      query: 'findUserById kind:method',
      mode: 'symbol',
      options: { workspaceRoots: [fixtureRoot] },
    });
    expect(methodSymbols.length).toBeGreaterThan(0);

    const classSymbols = await searchService.search({
      query: 'findUserById kind:class',
      mode: 'symbol',
      options: { workspaceRoots: [fixtureRoot] },
    });
    expect(classSymbols.length).toBe(0);

    // 3. path filter
    const srcFiles = await searchService.search({
      query: 'UserService path:src',
      mode: 'file',
      options: { workspaceRoots: [fixtureRoot] },
    });
    expect(srcFiles.length).toBeGreaterThan(0);

    const docsFiles = await searchService.search({
      query: 'UserService path:docs',
      mode: 'file',
      options: { workspaceRoots: [fixtureRoot] },
    });
    expect(docsFiles.length).toBe(0);
  });

  it('stores true workspace-relative path instead of plain basename', async () => {
    indexEngine.configure({
      storageDir: tempStorageDir,
    });
    await projectIndexService.initialize([fixtureRoot]);

    const store = projectIndexService.getStore();
    const files = await store.getAllFiles();
    const userFile = files.find((f) => f.path.includes('UserService.ts'));

    expect(userFile).toBeDefined();
    // Must be src/UserService.ts, NOT just UserService.ts
    expect(userFile?.relativePath.replace(/\\/g, '/')).toBe('src/UserService.ts');
  });

  it('verifies pipeline parity between searchController and searchCoordinator', async () => {
    indexEngine.configure({
      storageDir: tempStorageDir,
    });
    await projectIndexService.initialize([fixtureRoot]);

    const controllerResults = await searchController.search({
      query: 'UserService',
      mode: 'all',
      options: { workspaceRoots: [fixtureRoot] },
    });

    const coordinatorResults = await searchCoordinator.searchAll('UserService', {
      category: 'all',
      workspaceRoots: [fixtureRoot],
    });

    expect(controllerResults.length).toBeGreaterThan(0);
    expect(coordinatorResults.length).toBe(controllerResults.length);
    expect(coordinatorResults.map((r: SearchResult) => r.id)).toEqual(
      controllerResults.map((r: SearchResult) => r.id)
    );
  });
});
