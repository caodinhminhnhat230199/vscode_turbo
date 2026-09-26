import { describe, it, expect } from 'vitest';
import { classifyFile } from '../../../../src/core/workspace/classification/FileClassifier';

describe('FileClassifier', () => {
  it('classifies .g.dart files as generated source with explainable reason', () => {
    const result = classifyFile('d:\\projects\\flutter_app\\lib\\models\\user.g.dart');

    expect(result.source).toBe(true);
    expect(result.generated).toBe(true);
    expect(result.buildArtifact).toBe(false);
    expect(result.dependency).toBe(false);
    expect(result.reason).toContain('*.g.dart');
  });

  it('classifies .freezed.dart files as generated source', () => {
    const result = classifyFile('/projects/flutter_app/lib/models/state.freezed.dart');

    expect(result.source).toBe(true);
    expect(result.generated).toBe(true);
    expect(result.buildArtifact).toBe(false);
    expect(result.dependency).toBe(false);
    expect(result.reason).toContain('*.freezed.dart');
  });

  it('classifies build/ directory contents as build artifacts', () => {
    const result = classifyFile(
      '/projects/flutter_app/build/app/outputs/flutter-apk/app-release.apk'
    );

    expect(result.source).toBe(false);
    expect(result.generated).toBe(true);
    expect(result.buildArtifact).toBe(true);
    expect(result.dependency).toBe(false);
    expect(result.reason).toContain('build');
  });

  it('classifies .dart_tool/ directory contents as build artifacts', () => {
    const result = classifyFile('c:\\workspace\\app\\.dart_tool\\package_config.json');

    expect(result.source).toBe(false);
    expect(result.generated).toBe(true);
    expect(result.buildArtifact).toBe(true);
    expect(result.dependency).toBe(false);
    expect(result.reason).toContain('.dart_tool');
  });

  it('classifies node_modules/ directory contents as dependencies', () => {
    const result = classifyFile('/projects/node_app/node_modules/react/index.js');

    expect(result.source).toBe(false);
    expect(result.generated).toBe(false);
    expect(result.buildArtifact).toBe(false);
    expect(result.dependency).toBe(true);
    expect(result.reason).toContain('node_modules');
  });

  it('classifies dist/ directory contents as build artifacts', () => {
    const result = classifyFile('d:/projects/node_app/dist/bundle.js');

    expect(result.source).toBe(false);
    expect(result.generated).toBe(true);
    expect(result.buildArtifact).toBe(true);
    expect(result.dependency).toBe(false);
    expect(result.reason).toContain('dist');
  });

  it('classifies normal source files correctly', () => {
    const tsFile = classifyFile('/projects/node_app/src/index.ts');
    expect(tsFile.source).toBe(true);
    expect(tsFile.generated).toBe(false);
    expect(tsFile.buildArtifact).toBe(false);
    expect(tsFile.dependency).toBe(false);

    const dartFile = classifyFile('/projects/flutter_app/lib/main.dart');
    expect(dartFile.source).toBe(true);
    expect(dartFile.generated).toBe(false);
    expect(dartFile.buildArtifact).toBe(false);
    expect(dartFile.dependency).toBe(false);
  });

  it('classifies generated TypeScript files as generated source', () => {
    const genTs = classifyFile('/projects/web/src/schema.generated.ts');
    expect(genTs.source).toBe(true);
    expect(genTs.generated).toBe(true);
    expect(genTs.buildArtifact).toBe(false);
  });
});
