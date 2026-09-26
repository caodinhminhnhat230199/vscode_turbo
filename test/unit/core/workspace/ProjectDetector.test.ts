import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { DartProjectDetector } from '../../../../src/core/workspace/detection/DartProjectDetector';
import { NodeProjectDetector } from '../../../../src/core/workspace/detection/NodeProjectDetector';
import { JavaProjectDetector } from '../../../../src/core/workspace/detection/JavaProjectDetector';
import { PythonProjectDetector } from '../../../../src/core/workspace/detection/PythonProjectDetector';
import { CompositeProjectDetector } from '../../../../src/core/workspace/detection/CompositeProjectDetector';

describe('Project-Type Detectors', () => {
  const fixturesDir = path.resolve(__dirname, '../../../../test/fixtures');
  const flutterFixture = path.join(fixturesDir, 'sample-flutter');
  const nodeFixture = path.join(fixturesDir, 'sample-node');
  const javaFixture = path.join(fixturesDir, 'sample-java');
  const pythonFixture = path.join(fixturesDir, 'sample-python');

  it('detects Flutter fixture with Dart language, Flutter framework, and high confidence', async () => {
    const detector = new DartProjectDetector();
    const result = await detector.detect(flutterFixture);

    expect(result).not.toBeNull();
    expect(result?.language).toBe('Dart');
    expect(result?.framework).toBe('Flutter');
    expect(result?.confidence).toBe('high');
    expect(result?.indicators).toContain('pubspec.yaml');
    expect(result?.indicators).toContain('lib/');
  });

  it('detects Node/TypeScript fixture with React framework and high confidence', async () => {
    const detector = new NodeProjectDetector();
    const result = await detector.detect(nodeFixture);

    expect(result).not.toBeNull();
    expect(result?.language).toBe('TypeScript');
    expect(result?.framework).toBe('React');
    expect(result?.confidence).toBe('high');
    expect(result?.indicators).toContain('package.json');
    expect(result?.indicators).toContain('tsconfig.json');
  });

  it('detects Java Maven fixture with high confidence', async () => {
    const detector = new JavaProjectDetector();
    const result = await detector.detect(javaFixture);

    expect(result).not.toBeNull();
    expect(result?.language).toBe('Java');
    expect(result?.framework).toBe('Maven');
    expect(result?.confidence).toBe('high');
    expect(result?.indicators).toContain('pom.xml');
  });

  it('detects Python FastAPI fixture with high confidence', async () => {
    const detector = new PythonProjectDetector();
    const result = await detector.detect(pythonFixture);

    expect(result).not.toBeNull();
    expect(result?.language).toBe('Python');
    expect(result?.framework).toBe('FastAPI');
    expect(result?.confidence).toBe('high');
    expect(result?.indicators).toContain('pyproject.toml');
  });

  it('handles empty directory returning null', async () => {
    const detector = new DartProjectDetector();
    const result = await detector.detect(__dirname);
    expect(result).toBeNull();
  });

  it('composite detector supports multiple project types and summarizes workspace', async () => {
    const composite = new CompositeProjectDetector();
    const detectedFlutter = await composite.detectFolder(flutterFixture);
    const detectedNode = await composite.detectFolder(nodeFixture);

    expect(detectedFlutter).toHaveLength(1);
    expect(detectedNode).toHaveLength(1);

    const allProjects = [...detectedFlutter, ...detectedNode];
    const summary = composite.summarize(allProjects);

    expect(summary.languages['Dart']).toBe(1);
    expect(summary.languages['TypeScript']).toBe(1);
    expect(summary.frameworks).toContain('Flutter');
    expect(summary.frameworks).toContain('React');
  });

  it('detects multiple project roots in a workspace map', async () => {
    const composite = new CompositeProjectDetector();
    const roots = [flutterFixture, pythonFixture];
    const workspaceMap = await composite.detectWorkspace(roots);

    expect(workspaceMap.size).toBe(2);
    expect(workspaceMap.get(flutterFixture)?.[0].language).toBe('Dart');
    expect(workspaceMap.get(pythonFixture)?.[0].language).toBe('Python');
  });
});
