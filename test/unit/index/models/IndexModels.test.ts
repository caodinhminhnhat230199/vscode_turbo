import { describe, it, expect } from 'vitest';
import {
  createFileRecord,
  createSymbolRecord,
  createReferenceRecord,
  areFingerprintsEqual,
} from '../../../../src/index/models';

describe('Index Models (FileRecord, SymbolRecord, ReferenceRecord, FileFingerprint)', () => {
  it('creates FileRecord with normalized path and default id', () => {
    const file = createFileRecord({
      path: 'c:\\project\\src\\app.ts',
      relativePath: 'src\\app.ts',
      language: 'typescript',
      size: 1024,
      mtime: 1700000000000,
    });

    expect(file.path).toBe('c:/project/src/app.ts');
    expect(file.relativePath).toBe('src/app.ts');
    expect(file.language).toBe('typescript');
    expect(file.size).toBe(1024);
    expect(file.id).toBeDefined();
    expect(file.generated).toBe(false);
  });

  it('creates SymbolRecord with container and coordinate details', () => {
    const sym = createSymbolRecord({
      fileId: 'file-123',
      name: 'getUser',
      kind: 'function',
      line: 42,
      column: 10,
      containerName: 'UserService',
      adapterId: 'lsp-adapter',
    });

    expect(sym.id).toBe('file-123:42:10:getUser');
    expect(sym.name).toBe('getUser');
    expect(sym.kind).toBe('function');
    expect(sym.line).toBe(42);
    expect(sym.containerName).toBe('UserService');
  });

  it('creates ReferenceRecord', () => {
    const ref = createReferenceRecord({
      fileId: 'file-123',
      line: 88,
      column: 15,
      symbolId: 'sym-456',
      isWrite: true,
    });

    expect(ref.fileId).toBe('file-123');
    expect(ref.line).toBe(88);
    expect(ref.column).toBe(15);
    expect(ref.symbolId).toBe('sym-456');
    expect(ref.isWrite).toBe(true);
  });

  it('compares FileFingerprint with path normalization and tolerance', () => {
    const fp1 = { path: 'src/main.dart', size: 500, mtime: 1000 };
    const fp2 = { path: 'src\\main.dart', size: 500, mtime: 1001 };
    const fp3 = { path: 'src/main.dart', size: 501, mtime: 1000 };

    expect(areFingerprintsEqual(fp1, fp2)).toBe(true); // Within 1ms tolerance
    expect(areFingerprintsEqual(fp1, fp3)).toBe(false); // Size difference
  });
});
