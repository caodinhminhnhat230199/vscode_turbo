import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceFingerprint } from '../../../../src/index/fingerprint/WorkspaceFingerprint';
import { FileFingerprintEngine } from '../../../../src/index/fingerprint/FileFingerprintEngine';

describe('Fingerprint Engines (WorkspaceFingerprint & FileFingerprintEngine)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-fp-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('computes stable workspace fingerprint and detects configuration changes', async () => {
    const pkgJson = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgJson, JSON.stringify({ name: 'my-app' }), 'utf8');

    const res1 = await WorkspaceFingerprint.compute([tempDir], 1);
    expect(res1.hash).toBeDefined();

    // Identical files produce identical hash
    const res2 = await WorkspaceFingerprint.compute([tempDir], 1);
    expect(res1.hash).toBe(res2.hash);
    expect(WorkspaceFingerprint.isValid(res1.hash, res2.hash)).toBe(true);

    // Schema version increment changes hash
    const resV2 = await WorkspaceFingerprint.compute([tempDir], 2);
    expect(resV2.hash).not.toBe(res1.hash);
  });

  it('computes fast stat-based file fingerprint and content-based hash fingerprint', async () => {
    const filePath = path.join(tempDir, 'test.ts');
    fs.writeFileSync(filePath, 'console.log("hello world");', 'utf8');

    const fastFp = await FileFingerprintEngine.computeFast(filePath);
    expect(fastFp.size).toBe(27);
    expect(fastFp.mtime).toBeGreaterThan(0);
    expect(fastFp.hash).toBeUndefined();

    const hashFp = await FileFingerprintEngine.computeWithHash(filePath);
    expect(hashFp.size).toBe(27);
    expect(hashFp.hash).toBeDefined();

    // Fast comparison within 2ms tolerance returns unchanged
    const fpCopy = { ...fastFp, mtime: fastFp.mtime + 1 };
    expect(FileFingerprintEngine.hasChanged(fastFp, fpCopy)).toBe(false);

    // Size modification triggers change
    const sizeChanged = { ...fastFp, size: 99 };
    expect(FileFingerprintEngine.hasChanged(fastFp, sizeChanged)).toBe(true);
  });
});
