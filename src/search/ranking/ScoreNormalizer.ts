import { SearchResult } from '../models/SearchResult';

export class ScoreNormalizer {
  public static normalize(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) {
      return [];
    }

    return results.map((res) => {
      // Ensure score is bounded between 0 and 1
      const clamped = Math.max(0, Math.min(1, res.score));
      return {
        ...res,
        score: clamped,
      };
    });
  }

  public static compare(a: SearchResult, b: SearchResult): number {
    // Exact match guardrail: if one is exact and the other isn't, exact ALWAYS wins
    const isAExact = a.score >= 0.95;
    const isBExact = b.score >= 0.95;

    if (isAExact && !isBExact) {
      return -1;
    }
    if (!isAExact && isBExact) {
      return 1;
    }

    // Otherwise sort by normalized score descending
    return b.score - a.score;
  }
}
