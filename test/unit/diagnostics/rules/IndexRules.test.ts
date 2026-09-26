import { describe, it, expect } from 'vitest';
import { IndexRule001 } from '../../../../src/diagnostics/rules/indexRules';

describe('IndexRule001 (INDEX_001)', () => {
  const rule = new IndexRule001();

  it('returns empty findings when no reindex stats are provided or churn is low', () => {
    const findings = rule.evaluate({
      reindexStats: {
        invalidationsPerMinute: 2,
        reindexCount: 1,
        generatedFilesWatched: [],
      },
    });

    expect(findings).toHaveLength(0);
  });

  it('detects high invalidation rate and emits INDEX_001 finding', () => {
    const findings = rule.evaluate({
      reindexStats: {
        invalidationsPerMinute: 15,
        reindexCount: 6,
        generatedFilesWatched: ['build', '.dart_tool'],
      },
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding.id).toBe('INDEX_001:WorkspaceIndex');
    expect(finding.severity).toBe('high');
    expect(finding.category).toBe('index');
    expect(finding.recommendation).toBeDefined();
    expect(finding.recommendation?.changes).toHaveLength(2);
    expect(finding.recommendation?.changes?.[0].section).toBe('files.watcherExclude');
  });

  it('marks finding as critical when invalidation rate exceeds 20 per minute', () => {
    const findings = rule.evaluate({
      reindexStats: {
        invalidationsPerMinute: 28,
        reindexCount: 12,
        generatedFilesWatched: ['dist'],
      },
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].confidence).toBe('high');
  });
});
