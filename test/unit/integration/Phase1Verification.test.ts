import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { workspace, Uri } from '../../mocks/vscode';
import { compositeProjectDetector } from '../../../src/core/workspace/detection/CompositeProjectDetector';
import { workspaceScanner } from '../../../src/core/workspace/WorkspaceScanner';
import { workspaceDetector } from '../../../src/core/workspace/WorkspaceDetector';
import { excludeSettingsReader } from '../../../src/core/workspace/excludes/ExcludeSettingsReader';
import { diagnosticEngine } from '../../../src/diagnostics/DiagnosticEngine';
import { applyRecommendationService } from '../../../src/optimizer/ApplyRecommendation';
import { stateStore } from '../../../src/core/state/StateStore';
import { runWorkspaceAnalysis } from '../../../src/vscode/commands';

describe('P1.11 — Phase 1 End-to-End Verification', () => {
  const fixturesDir = path.resolve(__dirname, '../../fixtures');
  const flutterFixture = path.join(fixturesDir, 'sample-flutter');
  const nodeFixture = path.join(fixturesDir, 'sample-node');

  let tempDir: string;

  beforeEach(() => {
    stateStore.reset();
    workspace._clearConfigs();
  });

  afterEach(async () => {
    if (tempDir) {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('verifies Flutter project detection, scanning, and duration recording', async () => {
    // 1. Project detection
    const detected = await compositeProjectDetector.detectFolder(flutterFixture);
    expect(detected).toHaveLength(1);
    expect(detected[0].language).toBe('Dart');
    expect(detected[0].framework).toBe('Flutter');
    expect(detected[0].confidence).toBe('high');

    // 2. Workspace scan & duration
    const scanResult = await workspaceScanner.scan(flutterFixture);
    expect(scanResult.totalFiles).toBeGreaterThanOrEqual(2);
    expect(scanResult.durationMs).toBeGreaterThanOrEqual(0);
    expect(scanResult.extensionDistribution['.dart']).toBeGreaterThanOrEqual(1);
    expect(scanResult.extensionDistribution['.yaml']).toBeGreaterThanOrEqual(2);
  });

  it('verifies Node project detection and scanning', async () => {
    const detected = await compositeProjectDetector.detectFolder(nodeFixture);
    expect(detected).toHaveLength(1);
    expect(detected[0].language).toBe('TypeScript');
    expect(detected[0].framework).toBe('React');

    const scanResult = await workspaceScanner.scan(nodeFixture);
    expect(scanResult.totalFiles).toBeGreaterThanOrEqual(2);
    expect(scanResult.extensionDistribution['.json']).toBeGreaterThanOrEqual(2);
  });

  it('verifies generated-heavy project triggers appropriate diagnostic rules', async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codepulse-gen-heavy-'));
    const srcDir = path.join(tempDir, 'lib');
    await fs.promises.mkdir(srcDir, { recursive: true });

    // Create 10 source files and 30 generated files (75% generated ratio)
    for (let i = 0; i < 10; i++) {
      await fs.promises.writeFile(path.join(srcDir, `model_${i}.dart`), 'class Model {}');
    }
    for (let i = 0; i < 60; i++) {
      await fs.promises.writeFile(path.join(srcDir, `model_${i}.g.dart`), '// generated');
    }

    const scanResult = await workspaceScanner.scan(tempDir);
    const excludes = excludeSettingsReader.readEffectiveExcludes();

    const findings = diagnosticEngine.analyze({
      scanResult,
      excludes,
      generatedSourceCount: 60,
    });

    const ratioFinding = findings.find((f) => f.id === 'WORKSPACE_002');
    expect(ratioFinding).toBeDefined();
    expect(ratioFinding?.severity).toBe('medium');
    expect(ratioFinding?.summary).toContain('%');
  });

  it('verifies multi-root workspace detection and aggregated analysis', async () => {
    workspace._setWorkspaceFolders([
      {
        name: 'flutter-root',
        uri: Uri.file(flutterFixture),
        index: 0,
      },
      {
        name: 'node-root',
        uri: Uri.file(nodeFixture),
        index: 1,
      },
    ]);

    const state = workspaceDetector.refresh();
    expect(state.isMultiRoot).toBe(true);
    expect(state.folders).toHaveLength(2);

    const findings = await runWorkspaceAnalysis();
    const dashboardState = stateStore.getState();

    expect(dashboardState.workspace.folderCount).toBe(2);
    expect(dashboardState.workspace.languages['Dart']).toBe(1);
    expect(dashboardState.workspace.languages['TypeScript']).toBe(1);
    expect(dashboardState.workspace.frameworks).toContain('Flutter');
    expect(dashboardState.workspace.frameworks).toContain('React');
    expect(dashboardState.findings).toEqual(findings);
  });

  it('verifies that all applied diagnostic recommendations are completely reversible', async () => {
    const originalWatcherExclude = { '**/.git/**': true };
    workspace._setConfig('files.watcherExclude', originalWatcherExclude);

    // Context with unexcluded build folder
    const scanResult = {
      rootPath: flutterFixture,
      totalFiles: 20,
      totalDirectories: 3,
      totalSizeBytes: 10000,
      maxDepth: 2,
      extensionDistribution: { '.dart': 10 },
      largestFiles: [],
      detectedBuildFolders: ['build'],
      durationMs: 10,
      truncated: false,
    };
    const excludes = excludeSettingsReader.readEffectiveExcludes();

    const findings = diagnosticEngine.analyze({
      scanResult,
      excludes,
    });

    const watcherFinding = findings.find((f) => f.id === 'WATCHER_001:build');
    expect(watcherFinding?.recommendation).toBeDefined();

    // 1. Apply recommendation
    const applyRes = await applyRecommendationService.applyRecommendation(
      watcherFinding!.recommendation!,
      { skipPrompt: true }
    );
    expect(applyRes.success).toBe(true);

    const updatedConfig = workspace.getConfiguration('files').get('watcherExclude') as any;
    expect(updatedConfig['**/build/**']).toBe(true);
    expect(updatedConfig['**/.git/**']).toBe(true);

    // 2. Undo recommendation
    const undoRes = await applyRecommendationService.undo(applyRes.appliedRecord?.id, {
      skipPrompt: true,
    });
    expect(undoRes.success).toBe(true);

    const restoredConfig = workspace.getConfiguration('files').get('watcherExclude') as any;
    expect(restoredConfig['**/build/**']).toBeUndefined();
    expect(restoredConfig['**/.git/**']).toBe(true);
  });
});
