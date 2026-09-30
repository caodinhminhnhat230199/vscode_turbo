import { FuzzyMatcher } from './FuzzyMatcher';
import { SearchResult } from '../models/SearchResult';
import { ScoreNormalizer } from './ScoreNormalizer';

export interface RankingContext {
  activeFileUri?: string;
  recentlyOpenedPaths?: Set<string>;
  frequentlySelectedPaths?: Map<string, number>;
  preferredLanguage?: string;
}

export class RankingEngine {
  public static rank(
    results: SearchResult[],
    query: string,
    context?: RankingContext
  ): SearchResult[] {
    const scored = results.map((result) => {
      // 1. Base Match Score
      const match = FuzzyMatcher.match(result.label, query);
      let score = match.score;

      // Exact match guardrail: preserve exact match dominance
      if (score >= 0.95) {
        return {
          ...result,
          score: Math.min(1.0, score + 0.05),
        };
      }

      // If not even a fuzzy match on label, check path/description
      if (!match.matches && result.description) {
        const descMatch = FuzzyMatcher.match(result.description, query);
        if (descMatch.matches) {
          score = descMatch.score * 0.7; // Discount path-only matches
        }
      }

      // 2. Path Depth Penalty: shallower files rank slightly higher
      if (result.uri) {
        const depth = result.uri.path.split('/').length;
        const depthPenalty = Math.min(0.1, depth * 0.01);
        score = Math.max(0.05, score - depthPenalty);
      }

      // 3. Current Folder Bonus
      if (context?.activeFileUri && result.uri) {
        const activeDir = context.activeFileUri.substring(
          0,
          context.activeFileUri.lastIndexOf('/')
        );
        const resultDir = result.uri.fsPath.substring(0, result.uri.fsPath.lastIndexOf('/'));
        if (activeDir && resultDir.includes(activeDir)) {
          score += 0.05;
        }
      }

      // 4. Recency Bonus (capped at 0.10)
      if (context?.recentlyOpenedPaths?.has(result.uri.fsPath)) {
        score += 0.08;
      }

      // 5. Frequency Bonus (capped at 0.07)
      if (context?.frequentlySelectedPaths) {
        const freq = context.frequentlySelectedPaths.get(result.uri.fsPath) ?? 0;
        if (freq > 0) {
          score += Math.min(0.07, freq * 0.02);
        }
      }

      // Cap non-exact scores below 0.94 to protect exact match dominance
      const finalScore = Math.min(0.94, score);

      return {
        ...result,
        score: finalScore,
      };
    });

    // Normalize and sort
    const normalized = ScoreNormalizer.normalize(scored);
    return normalized.sort(ScoreNormalizer.compare);
  }
}
