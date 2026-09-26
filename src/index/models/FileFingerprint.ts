export interface FileFingerprint {
  path: string;
  size: number;
  mtime: number;
  hash?: string;
}

export function areFingerprintsEqual(
  a: FileFingerprint,
  b: FileFingerprint,
  compareHash = false
): boolean {
  if (a.path.replace(/\\/g, '/') !== b.path.replace(/\\/g, '/')) {
    return false;
  }
  if (a.size !== b.size) {
    return false;
  }
  // Allow timestamp within 1 millisecond tolerance for filesystem quantization
  if (Math.abs(a.mtime - b.mtime) > 1) {
    return false;
  }
  if (compareHash && a.hash && b.hash) {
    return a.hash === b.hash;
  }
  return true;
}
