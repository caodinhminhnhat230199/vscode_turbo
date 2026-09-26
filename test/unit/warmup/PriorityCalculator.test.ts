import { describe, it, expect } from 'vitest';
import { PriorityCalculator } from '../../../src/warmup/priority/PriorityCalculator';

describe('P9.4 — PriorityCalculator', () => {
  it('active dependency outranks unrelated background file', () => {
    const activeDependencyScore = PriorityCalculator.calculateScore({
      filePath: '/src/models/user.ts',
      isDependencyNeighbor: true,
      dependencyDistance: 1,
    });

    const unrelatedBackgroundScore = PriorityCalculator.calculateScore({
      filePath: '/src/legacy/unused.ts',
    });

    expect(activeDependencyScore).toBeGreaterThan(unrelatedBackgroundScore);
    expect(activeDependencyScore).toBe(40);
    expect(unrelatedBackgroundScore).toBe(0);
  });

  it('git changed outranks old recent file', () => {
    const gitChangedScore = PriorityCalculator.calculateScore({
      filePath: '/src/services/api.ts',
      isGitChanged: true,
    });

    const oldRecentScore = PriorityCalculator.calculateScore({
      filePath: '/src/config/old.ts',
      isRecent: true,
      recentScore: 0.2, // low recency factor
    });

    expect(gitChangedScore).toBe(30);
    expect(oldRecentScore).toBe(4);
    expect(gitChangedScore).toBeGreaterThan(oldRecentScore);
  });

  it('applies distance decay for transitive dependencies', () => {
    const dist1 = PriorityCalculator.calculateScore({
      filePath: '/src/a.ts',
      isDependencyNeighbor: true,
      dependencyDistance: 1,
    });

    const dist2 = PriorityCalculator.calculateScore({
      filePath: '/src/b.ts',
      isDependencyNeighbor: true,
      dependencyDistance: 2,
    });

    const dist3 = PriorityCalculator.calculateScore({
      filePath: '/src/c.ts',
      isDependencyNeighbor: true,
      dependencyDistance: 3,
    });

    expect(dist1).toBe(40);
    expect(dist2).toBe(20);
    expect(dist3).toBeLessThan(dist2);
  });

  it('maps calculated score to queue priority correctly', () => {
    // 0 is highest queue priority (preemptive)
    expect(PriorityCalculator.calculateQueuePriority(60)).toBe(0);
    expect(PriorityCalculator.calculateQueuePriority(40)).toBe(1);
    expect(PriorityCalculator.calculateQueuePriority(30)).toBe(2);
    expect(PriorityCalculator.calculateQueuePriority(20)).toBe(3);
    expect(PriorityCalculator.calculateQueuePriority(10)).toBe(4);
    expect(PriorityCalculator.calculateQueuePriority(0)).toBe(5);
  });
});
