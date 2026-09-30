import { RipgrepEngine } from '../engine/RipgrepEngine';
import { TextSearchResult } from '../models/SearchResult';
import { TextSearchOptions } from '../models/SearchOptions';

export class TextSearchEngine {
  private ripgrep: RipgrepEngine;

  constructor(ripgrep?: RipgrepEngine) {
    this.ripgrep = ripgrep ?? new RipgrepEngine();
  }

  public async search(query: string, options?: TextSearchOptions): Promise<TextSearchResult[]> {
    return this.ripgrep.search(query, options);
  }

  public static killAllProcesses(): void {
    RipgrepEngine.killAllProcesses();
  }
}
