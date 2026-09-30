import * as fs from 'fs';
import * as readline from 'readline';
import { LRUCache } from '../../cache/LRUCache';

export interface PreviewSnippet {
  filePath: string;
  startLine: number;
  endLine: number;
  highlightLine?: number;
  lines: string[];
}

export class SearchPreviewService {
  private static readonly MAX_PREVIEW_LINES = 20;
  private static readonly MAX_PREVIEW_FILE_BYTES = 5 * 1024 * 1024;
  private static readonly BINARY_SAMPLE_BYTES = 8 * 1024;
  private static instance: SearchPreviewService | null = null;
  private snippetCache = new LRUCache<PreviewSnippet>(100);

  public static getInstance(): SearchPreviewService {
    if (!SearchPreviewService.instance) {
      SearchPreviewService.instance = new SearchPreviewService();
    }
    return SearchPreviewService.instance;
  }

  public async getPreview(
    filePath: string,
    targetLine = 1,
    maxLines = 15
  ): Promise<PreviewSnippet | undefined> {
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile() || stat.size > SearchPreviewService.MAX_PREVIEW_FILE_BYTES) {
        return undefined;
      }
      if (await this.isBinaryFile(filePath, stat.size)) {
        return undefined;
      }

      const safeTargetLine = Number.isFinite(targetLine) ? Math.max(1, Math.floor(targetLine)) : 1;
      const requestedMaxLines = Number.isFinite(maxLines) ? Math.floor(maxLines) : 15;
      const safeMaxLines = Math.max(
        1,
        Math.min(SearchPreviewService.MAX_PREVIEW_LINES, requestedMaxLines)
      );
      const cacheKey = `${filePath}:${stat.size}:${stat.mtimeMs}:${safeTargetLine}:${safeMaxLines}`;
      const cached = this.snippetCache.get<PreviewSnippet>(cacheKey);
      if (cached) {
        return cached;
      }

      const scanStartLine = Math.max(1, safeTargetLine - safeMaxLines + 1);
      const scanEndLine = safeTargetLine + safeMaxLines - 1;
      const candidates: Array<{ number: number; text: string }> = [];
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      let currentLine = 0;

      try {
        for await (const line of rl) {
          currentLine++;
          if (currentLine >= scanStartLine && currentLine <= scanEndLine) {
            candidates.push({ number: currentLine, text: line });
          }
          if (currentLine > scanEndLine) {
            break;
          }
        }
      } finally {
        rl.close();
        fileStream.destroy();
      }

      const linesBeforeTarget = Math.floor((safeMaxLines - 1) / 2);
      const startLine = Math.max(
        1,
        Math.min(safeTargetLine - linesBeforeTarget, Math.max(1, currentLine - safeMaxLines + 1))
      );
      const endLine = Math.min(currentLine, startLine + safeMaxLines - 1);
      const lines = candidates
        .filter((candidate) => candidate.number >= startLine && candidate.number <= endLine)
        .map((candidate) => candidate.text);
      const snippet: PreviewSnippet = {
        filePath,
        startLine,
        endLine,
        highlightLine: safeTargetLine,
        lines,
      };

      this.snippetCache.set(cacheKey, snippet, 60000); // 1 min TTL
      return snippet;
    } catch {
      return undefined;
    }
  }

  public clear(): void {
    this.snippetCache.clear();
  }

  private async isBinaryFile(filePath: string, size: number): Promise<boolean> {
    if (size === 0) {
      return false;
    }
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const sample = Buffer.alloc(Math.min(size, SearchPreviewService.BINARY_SAMPLE_BYTES));
      const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
      let controlCharacters = 0;
      for (let index = 0; index < bytesRead; index++) {
        const byte = sample[index];
        if (byte === 0) {
          return true;
        }
        if (byte < 7 || (byte > 13 && byte < 32)) {
          controlCharacters++;
        }
      }
      return bytesRead > 0 && controlCharacters / bytesRead > 0.1;
    } finally {
      await handle.close();
    }
  }
}

export const searchPreviewService = SearchPreviewService.getInstance();
