import * as crypto from 'crypto';
import * as fs from 'fs';
import { FileFingerprint } from '../models/FileFingerprint';

export class FileFingerprintEngine {
  /**
   * Fast path: computes fingerprint using size + mtime without reading file contents.
   */
  public static fromStat(filePath: string, stat: fs.Stats): FileFingerprint {
    return {
      path: filePath.replace(/\\/g, '/'),
      size: stat.size,
      mtime: Math.round(stat.mtimeMs),
    };
  }

  /**
   * Reads file stat from disk.
   */
  public static async computeFast(filePath: string): Promise<FileFingerprint> {
    const stat = await fs.promises.stat(filePath);
    return FileFingerprintEngine.fromStat(filePath, stat);
  }

  /**
   * Slow path: computes SHA-256 hash of file contents for ambiguous cases.
   */
  public static async computeWithHash(filePath: string): Promise<FileFingerprint> {
    const stat = await fs.promises.stat(filePath);
    const content = await fs.promises.readFile(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    return {
      path: filePath.replace(/\\/g, '/'),
      size: stat.size,
      mtime: Math.round(stat.mtimeMs),
      hash,
    };
  }

  /**
   * Checks if two fingerprints match.
   * If both contain a hash, hashes are compared; otherwise size + normalized mtime are compared.
   */
  public static hasChanged(prev: FileFingerprint, current: FileFingerprint): boolean {
    if (prev.path.replace(/\\/g, '/') !== current.path.replace(/\\/g, '/')) {
      return true;
    }
    if (prev.size !== current.size) {
      return true;
    }
    if (prev.hash && current.hash) {
      return prev.hash !== current.hash;
    }
    // Tolerance for filesystem quantization (e.g., git checkouts or FAT filesystems)
    return Math.abs(prev.mtime - current.mtime) > 2;
  }
}
