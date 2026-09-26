import { describe, it, expect } from 'vitest';
import { LanguageRulesEvaluator } from '../../../../src/diagnostics/rules/languageRules';
import { BenchmarkResult } from '../../../../src/benchmark/benchmarkTypes';

function createMockBenchmark(partial: Partial<BenchmarkResult>): BenchmarkResult {
  return {
    operation: 'definition',
    sampleCount: 5,
    minMs: 20,
    maxMs: 50,
    p50Ms: 30,
    p75Ms: 40,
    p90Ms: 45,
    p95Ms: 50,
    cold: false,
    timestamp: Date.now(),
    cancelled: false,
    timeoutCount: 0,
    errorCount: 0,
    samples: [
      { iteration: 0, durationMs: 30, resultCount: 1, isWarmup: true, timestamp: Date.now() },
      { iteration: 1, durationMs: 30, resultCount: 1, isWarmup: false, timestamp: Date.now() },
    ],
    ...partial,
  };
}

describe('Language Diagnostic Rules (LANGUAGE_001 - LANGUAGE_004)', () => {
  it('generates LANGUAGE_001 finding and recommendation on cold start latency', () => {
    const res = createMockBenchmark({
      operation: 'definition',
      category: 'LANGUAGE_COLD_START',
      p50Ms: 120,
      samples: [
        { iteration: 0, durationMs: 2800, resultCount: 1, isWarmup: true, timestamp: 0 },
        { iteration: 1, durationMs: 120, resultCount: 1, isWarmup: false, timestamp: 0 },
      ],
    });

    const findings = LanguageRulesEvaluator.evaluateBenchmark(res);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding.sourceMetadata?.ruleId).toBe('LANGUAGE_001');
    expect(finding.category).toBe('languageServer');
    expect(finding.severity).toBe('medium');
    expect(finding.recommendation).toBeDefined();
    expect(finding.recommendation?.id).toBe('REC_WARMUP_DEFINITION');
    expect(finding.recommendation?.changes).toBeDefined();
    expect(finding.recommendation?.safeToAutoApply).toBe(true);
  });

  it('generates LANGUAGE_002 finding and recommendation on persistent slow provider', () => {
    const res = createMockBenchmark({
      operation: 'references',
      category: 'LANGUAGE_PERSISTENT_SLOW',
      p50Ms: 1200,
      p95Ms: 1800,
    });

    const findings = LanguageRulesEvaluator.evaluateBenchmark(res);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding.sourceMetadata?.ruleId).toBe('LANGUAGE_002');
    expect(finding.category).toBe('navigation');
    expect(finding.severity).toBe('high');
    expect(finding.recommendation?.id).toBe('REC_HYBRID_NAV_REFERENCES');
    expect(finding.recommendation?.changes?.[0].newValue).toBe('hybrid');
  });

  it('generates LANGUAGE_003 finding and recommendation on provider timeouts', () => {
    const res = createMockBenchmark({
      operation: 'workspaceSymbols',
      category: 'PROVIDER_TIMEOUT',
      timeoutCount: 2,
    });

    const findings = LanguageRulesEvaluator.evaluateBenchmark(res);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding.sourceMetadata?.ruleId).toBe('LANGUAGE_003');
    expect(finding.severity).toBe('high');
    expect(finding.recommendation?.id).toBe('REC_RESTART_LS_WORKSPACESYMBOLS');
    expect(finding.recommendation?.safeToAutoApply).toBe(false);
  });

  it('generates LANGUAGE_004 finding when no provider is registered', () => {
    const res = createMockBenchmark({
      operation: 'fileSearch',
      category: 'NO_PROVIDER',
      sampleCount: 0,
    });

    const findings = LanguageRulesEvaluator.evaluateBenchmark(res);
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding.sourceMetadata?.ruleId).toBe('LANGUAGE_004');
    expect(finding.severity).toBe('info');
    expect(finding.recommendation?.id).toBe('REC_NO_PROVIDER_FILESEARCH');
  });

  it('generates zero findings when performance is OPTIMAL', () => {
    const res = createMockBenchmark({
      operation: 'definition',
      category: 'OPTIMAL',
      p50Ms: 45,
    });

    const findings = LanguageRulesEvaluator.evaluateBenchmark(res);
    expect(findings).toHaveLength(0);
  });
});
