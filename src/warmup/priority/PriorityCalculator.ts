export interface FilePriorityContext {
  filePath: string;
  isActiveFile?: boolean;
  isDependencyNeighbor?: boolean;
  dependencyDistance?: number; // 1, 2, ...
  isGitChanged?: boolean;
  isRecent?: boolean;
  recentScore?: number; // 0 to 1 based on recency
  isEntryPoint?: boolean;
  navigationCount?: number;
}

export class PriorityCalculator {
  public static calculateScore(ctx: FilePriorityContext): number {
    let score = 0;

    // 1. Active file itself gets highest base
    if (ctx.isActiveFile) {
      score += 60;
    }

    // 2. Active dependency neighbor (distance decay)
    if (ctx.isDependencyNeighbor) {
      const dist = ctx.dependencyDistance ?? 1;
      if (dist === 1) {
        score += 40;
      } else if (dist === 2) {
        score += 20;
      } else {
        score += Math.max(5, Math.round(20 / dist));
      }
    }

    // 3. Git changed file
    if (ctx.isGitChanged) {
      score += 30;
    }

    // 4. Entrypoint (e.g. main.dart, index.ts)
    if (ctx.isEntryPoint) {
      score += 25;
    }

    // 5. Recent file usage (scaled by recency decay)
    if (ctx.isRecent) {
      const factor =
        ctx.recentScore !== undefined ? Math.max(0, Math.min(1, ctx.recentScore)) : 1.0;
      score += Math.round(20 * factor);
    }

    // 6. Navigation frequency
    if (ctx.navigationCount && ctx.navigationCount > 0) {
      score += Math.min(15, ctx.navigationCount * 3);
    }

    return score;
  }

  public static calculateQueuePriority(score: number): number {
    // Maps calculated score to WarmupTask priority (0: highest, 10: lowest)
    if (score >= 60) {
      return 0;
    }
    if (score >= 40) {
      return 1;
    }
    if (score >= 30) {
      return 2;
    }
    if (score >= 20) {
      return 3;
    }
    if (score >= 10) {
      return 4;
    }
    return 5;
  }
}
