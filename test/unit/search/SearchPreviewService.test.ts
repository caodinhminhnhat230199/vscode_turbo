import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SearchPreviewService } from '../../../src/search/preview/SearchPreviewService';

describe('SearchPreviewService', () => {
  let service: SearchPreviewService;
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    service = new SearchPreviewService();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-preview-'));
    testFile = path.join(tmpDir, 'sample.ts');

    const lines: string[] = [];
    for (let i = 1; i <= 50; i++) {
      lines.push(`Line ${i}: const val_${i} = ${i};`);
    }
    fs.writeFileSync(testFile, lines.join('\n'), 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fetches a windowed snippet around the target line', async () => {
    const preview = await service.getPreview(testFile, 25, 5);
    expect(preview).toBeDefined();
    expect(preview?.startLine).toBe(23);
    expect(preview?.endLine).toBe(27);
    expect(preview?.highlightLine).toBe(25);
    expect(preview?.lines.length).toBe(5);
    expect(preview?.lines[2]).toContain('Line 25');
  });

  it('caps previews at twenty lines', async () => {
    const preview = await service.getPreview(testFile, 25, 100);
    expect(preview?.lines).toHaveLength(20);
  });

  it('does not preview binary files', async () => {
    const binaryFile = path.join(tmpDir, 'image.bin');
    fs.writeFileSync(binaryFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));

    await expect(service.getPreview(binaryFile, 1, 15)).resolves.toBeUndefined();
  });

  it('does not return a cached preview after the file is deleted', async () => {
    expect(await service.getPreview(testFile, 10, 15)).toBeDefined();
    fs.unlinkSync(testFile);

    await expect(service.getPreview(testFile, 10, 15)).resolves.toBeUndefined();
  });

  it('handles non-existent file safely', async () => {
    const preview = await service.getPreview('/non/existent/file.ts', 10);
    expect(preview).toBeUndefined();
  });
});
