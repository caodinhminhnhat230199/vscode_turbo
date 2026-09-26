import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceFingerprintPayload {
  roots: string[];
  schemaVersion: number;
  configTimestamps: Record<string, number>;
  generatedAt: number;
}

export class WorkspaceFingerprint {
  public static async compute(
    roots: string[],
    schemaVersion: number
  ): Promise<{ hash: string; payload: WorkspaceFingerprintPayload }> {
    const sortedRoots = [...roots].map((r) => r.replace(/\\/g, '/').toLowerCase()).sort();
    const configTimestamps: Record<string, number> = {};

    const markerFiles = [
      'package.json',
      'tsconfig.json',
      'pubspec.yaml',
      'pom.xml',
      'build.gradle',
      'requirements.txt',
      'pyproject.toml',
      '.vscode/settings.json',
    ];

    for (const root of roots) {
      for (const marker of markerFiles) {
        const fullPath = path.join(root, marker);
        if (fs.existsSync(fullPath)) {
          try {
            const stat = fs.statSync(fullPath);
            configTimestamps[`${root}/${marker}`.replace(/\\/g, '/')] = Math.round(stat.mtimeMs);
          } catch {
            // ignore
          }
        }
      }
    }

    const payload: WorkspaceFingerprintPayload = {
      roots: sortedRoots,
      schemaVersion,
      configTimestamps,
      generatedAt: Date.now(),
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ roots: sortedRoots, schemaVersion, configTimestamps }))
      .digest('hex');

    return { hash, payload };
  }

  public static isValid(prevHash: string | undefined, currentHash: string): boolean {
    if (!prevHash) {
      return false;
    }
    return prevHash === currentHash;
  }
}
