import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceScanner } from '../../../../src/core/workspace/WorkspaceScanner';

describe('WorkspaceScanner', () => {
  let tempDir: string;
  const scanner = new WorkspaceScanner();

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codepulse-scan-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('scans a directory structure and computes file, directory, and extension metrics', async () => {
    // Create nested dirs and files
    const subDir1 = path.join(tempDir, 'src');
    const subDir2 = path.join(tempDir, 'src', 'utils');
    await fs.promises.mkdir(subDir2, { recursive: true });

    await fs.promises.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test' })
    );
    await fs.promises.writeFile(path.join(subDir1, 'index.ts'), 'console.log("hello");');
    await fs.promises.writeFile(
      path.join(subDir2, 'math.ts'),
      'export const add = (a: number, b: number) => a + b;'
    );

    const result = await scanner.scan(tempDir);

    expect(result.totalFiles).toBe(3);
    expect(result.totalDirectories).toBe(2);
    expect(result.extensionDistribution['.json']).toBe(1);
    expect(result.extensionDistribution['.ts']).toBe(2);
    expect(result.totalSizeBytes).toBeGreaterThan(0);
    expect(result.maxDepth).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('detects and excludes known build folders without traversing them', async () => {
    const nodeModules = path.join(tempDir, 'node_modules', 'dep');
    const buildDir = path.join(tempDir, 'build');
    await fs.promises.mkdir(nodeModules, { recursive: true });
    await fs.promises.mkdir(buildDir, { recursive: true });

    // Put files inside excluded dirs that should NOT be counted in totalFiles
    await fs.promises.writeFile(path.join(nodeModules, 'dep.js'), 'module.exports = {};');
    await fs.promises.writeFile(path.join(buildDir, 'bundle.js'), 'var a = 1;');
    // Put a normal file
    await fs.promises.writeFile(path.join(tempDir, 'app.ts'), 'console.log("app");');

    const result = await scanner.scan(tempDir);

    expect(result.totalFiles).toBe(1); // Only app.ts
    expect(result.detectedBuildFolders).toContain('node_modules');
    expect(result.detectedBuildFolders).toContain('build');
    expect(result.extensionDistribution['.js']).toBeUndefined();
  });

  it('tracks largest files in descending order up to limit', async () => {
    await fs.promises.writeFile(path.join(tempDir, 'small.txt'), '12345');
    await fs.promises.writeFile(path.join(tempDir, 'large.txt'), '12345678901234567890');
    await fs.promises.writeFile(path.join(tempDir, 'medium.txt'), '1234567890');

    const result = await scanner.scan(tempDir, { largestFilesLimit: 2 });

    expect(result.largestFiles).toHaveLength(2);
    expect(result.largestFiles[0].path).toContain('large.txt');
    expect(result.largestFiles[1].path).toContain('medium.txt');
    expect(result.largestFiles[0].sizeBytes).toBeGreaterThan(result.largestFiles[1].sizeBytes);
  });

  it('supports cancellation token', async () => {
    const subDir = path.join(tempDir, 'many');
    await fs.promises.mkdir(subDir, { recursive: true });
    for (let i = 0; i < 50; i++) {
      await fs.promises.writeFile(path.join(subDir, `file_${i}.txt`), `content ${i}`);
    }

    const token = { isCancellationRequested: false };

    // Cancel after 10ms
    setTimeout(() => {
      token.isCancellationRequested = true;
    }, 5);

    const result = await scanner.scan(tempDir, {
      token,
      yieldInterval: 5,
    });

    expect(result.truncated).toBe(true);
    expect(result.truncateReason).toBe('cancelled');
  });

  it('enforces maxFiles limit', async () => {
    const subDir = path.join(tempDir, 'files');
    await fs.promises.mkdir(subDir, { recursive: true });
    for (let i = 0; i < 15; i++) {
      await fs.promises.writeFile(path.join(subDir, `f_${i}.txt`), 'a');
    }

    const result = await scanner.scan(tempDir, { maxFiles: 5 });

    expect(result.truncated).toBe(true);
    expect(result.truncateReason).toBe('maxFiles');
    expect(result.totalFiles).toBe(5);
  });
});
