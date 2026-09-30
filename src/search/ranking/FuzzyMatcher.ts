export interface FuzzyMatchResult {
  matches: boolean;
  score: number;
  highlightIndices?: number[];
}

export class FuzzyMatcher {
  public static match(target: string, query: string): FuzzyMatchResult {
    if (!query) {
      return { matches: true, score: 0.5 };
    }

    const t = target.trim();
    const q = query.trim();

    if (!t) {
      return { matches: false, score: 0 };
    }

    // 1. Exact case-sensitive match
    if (t === q) {
      return { matches: true, score: 1.0 };
    }

    const tLower = t.toLowerCase();
    const qLower = q.toLowerCase();

    // 2. Exact case-insensitive match
    if (tLower === qLower) {
      return { matches: true, score: 0.95 };
    }

    // 3. Exact Prefix match
    if (tLower.startsWith(qLower)) {
      const lengthBonus = qLower.length / tLower.length;
      return { matches: true, score: 0.85 + 0.08 * lengthBonus };
    }

    // 4. CamelCase match (e.g. "US" -> "UserService", "fb" -> "FooBar")
    const camelUpper = t.replace(/[^A-Z]/g, '');
    if (camelUpper && q.toUpperCase() === camelUpper) {
      return { matches: true, score: 0.82 };
    }
    if (camelUpper && camelUpper.startsWith(q.toUpperCase())) {
      return { matches: true, score: 0.78 };
    }

    // 5. Word boundary match (e.g. "user_service" -> "us", "user-service" -> "us")
    const words = tLower.split(/[_\-.\s/]/).filter(Boolean);
    const wordInitials = words.map((w) => w[0]).join('');
    if (wordInitials.startsWith(qLower)) {
      return { matches: true, score: 0.75 };
    }

    // 6. Substring contains match
    const containsIdx = tLower.indexOf(qLower);
    if (containsIdx !== -1) {
      const positionPenalty = Math.min(0.2, (containsIdx / tLower.length) * 0.2);
      return { matches: true, score: 0.7 - positionPenalty };
    }

    // 7. Subsequence fuzzy match with gap penalty
    let tIdx = 0;
    let qIdx = 0;
    let consecutiveCount = 0;
    let gaps = 0;
    const highlightIndices: number[] = [];

    while (tIdx < tLower.length && qIdx < qLower.length) {
      if (tLower[tIdx] === qLower[qIdx]) {
        highlightIndices.push(tIdx);
        consecutiveCount++;
        qIdx++;
      } else {
        if (consecutiveCount > 0) {
          gaps++;
        }
        consecutiveCount = 0;
      }
      tIdx++;
    }

    if (qIdx === qLower.length) {
      // Matched all query characters as subsequence
      const coverage = qLower.length / tLower.length;
      const gapPenalty = Math.min(0.3, gaps * 0.05);
      const rawScore = 0.5 * coverage + 0.2 - gapPenalty;
      const score = Math.max(0.1, Math.round(rawScore * 1000) / 1000);
      return { matches: true, score, highlightIndices };
    }

    return { matches: false, score: 0 };
  }
}
