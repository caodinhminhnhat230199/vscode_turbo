import { describe, it, expect } from 'vitest';
import { FuzzyMatcher } from '../../../src/search/ranking/FuzzyMatcher';

describe('FuzzyMatcher', () => {
  it('identifies exact match with highest score', () => {
    const res = FuzzyMatcher.match('UserService', 'UserService');
    expect(res.matches).toBe(true);
    expect(res.score).toBe(1.0);
  });

  it('matches prefix queries', () => {
    const res = FuzzyMatcher.match('UserService', 'User');
    expect(res.matches).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(0.85);
  });

  it('matches CamelCase queries', () => {
    const res = FuzzyMatcher.match('UserService', 'US');
    expect(res.matches).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(0.78);
  });

  it('matches subsequence fuzzy queries', () => {
    const res = FuzzyMatcher.match('user_controller.dart', 'usctrl');
    expect(res.matches).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(0.2);
  });

  it('rejects completely non-matching queries', () => {
    const res = FuzzyMatcher.match('UserService', 'xyz123');
    expect(res.matches).toBe(false);
    expect(res.score).toBe(0);
  });
});
