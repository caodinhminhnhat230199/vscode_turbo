import { BenchmarkResult } from '../../benchmark/benchmarkTypes';
import { ColdWarmClassifier } from '../../benchmark/ColdWarmClassifier';
import { PerformanceFinding, createFinding } from '../model/Finding';
import { createEvidence } from '../model/Evidence';
import { createRecommendation } from '../model/Recommendation';

export class LanguageRulesEvaluator {
  public static evaluateBenchmark(result: BenchmarkResult): PerformanceFinding[] {
    const findings: PerformanceFinding[] = [];
    const category = result.category ?? ColdWarmClassifier.classify(result);
    const op = result.operation;
    const firstSampleMs = result.samples?.[0]?.durationMs ?? result.minMs;

    switch (category) {
      case 'LANGUAGE_COLD_START':
        findings.push(
          createFinding({
            ruleId: 'LANGUAGE_001',
            target: op,
            category: 'languageServer',
            severity: 'medium',
            confidence: 'high',
            title: `Language Server cold-start latency dominant for ${op}`,
            summary: `First ${op} request took ${firstSampleMs}ms, but warm median is only ${result.p50Ms}ms. This indicates cold Language Server initialization lag.`,
            evidence: [
              createEvidence('Cold Latency', firstSampleMs, 'BenchmarkRunner', 'ms'),
              createEvidence('Warm P50 Latency', result.p50Ms, 'BenchmarkRunner', 'ms'),
              createEvidence('Operation', op, 'BenchmarkRunner'),
            ],
            recommendation: createRecommendation({
              id: `REC_WARMUP_${op.toUpperCase()}`,
              type: 'vsTurboSetting',
              title: 'Enable background project warmup on startup',
              description:
                'Enable VS Turbo background warmup to trigger language server readiness before editing begins.',
              safeToAutoApply: true,
              changes: [
                {
                  section: 'vsturbo.warmup.enabled',
                  oldValue: false,
                  newValue: true,
                  description: 'Enable background warmup',
                },
                {
                  section: 'vsturbo.warmup.onStartup',
                  oldValue: false,
                  newValue: true,
                  description: 'Warm up on workspace startup',
                },
              ],
            }),
            detector: 'LanguageDiagnostic',
            details: { coldDurationMs: firstSampleMs, warmP50Ms: result.p50Ms },
          })
        );
        break;

      case 'LANGUAGE_PERSISTENT_SLOW':
        findings.push(
          createFinding({
            ruleId: 'LANGUAGE_002',
            target: op,
            category: 'navigation',
            severity: 'high',
            confidence: 'high',
            title: `Consistently slow warm provider for ${op} (P50: ${result.p50Ms}ms)`,
            summary: `Even after warmup, ${op} takes a median of ${result.p50Ms}ms (P95: ${result.p95Ms}ms). The language server or workspace indexing is saturated.`,
            evidence: [
              createEvidence('Warm P50', result.p50Ms, 'BenchmarkRunner', 'ms'),
              createEvidence('Warm P95', result.p95Ms, 'BenchmarkRunner', 'ms'),
              createEvidence('Sample Count', result.sampleCount, 'BenchmarkRunner'),
            ],
            recommendation: createRecommendation({
              id: `REC_HYBRID_NAV_${op.toUpperCase()}`,
              type: 'vsTurboSetting',
              title: 'Switch to VS Turbo Hybrid Navigation mode',
              description: 'Use VS Turbo local fast symbol index alongside native language server.',
              safeToAutoApply: true,
              changes: [
                {
                  section: 'vsturbo.navigation.mode',
                  oldValue: 'native',
                  newValue: 'hybrid',
                  description: 'Enable hybrid navigation mode',
                },
              ],
            }),
            detector: 'LanguageDiagnostic',
            details: { p50Ms: result.p50Ms, p95Ms: result.p95Ms },
          })
        );
        break;

      case 'PROVIDER_TIMEOUT':
        findings.push(
          createFinding({
            ruleId: 'LANGUAGE_003',
            target: op,
            category: 'languageServer',
            severity: 'high',
            confidence: 'high',
            title: `Language server timeouts detected for ${op}`,
            summary: `${result.timeoutCount} requests timed out during ${op} benchmark. The language server may be hung or processing huge files.`,
            evidence: [
              createEvidence('Timeouts', result.timeoutCount ?? 0, 'BenchmarkRunner', 'timeouts'),
              createEvidence('Operation', op, 'BenchmarkRunner'),
            ],
            recommendation: createRecommendation({
              id: `REC_RESTART_LS_${op.toUpperCase()}`,
              type: 'restartLanguageServer',
              title: 'Restart Language Server / Dart Analysis Server',
              description:
                'Restart the underlying language server to clear deadlocks or memory leaks.',
              safeToAutoApply: false,
            }),
            detector: 'LanguageDiagnostic',
            details: { timeoutCount: result.timeoutCount },
          })
        );
        break;

      case 'NO_PROVIDER':
        findings.push(
          createFinding({
            ruleId: 'LANGUAGE_004',
            target: op,
            category: 'languageServer',
            severity: 'info',
            confidence: 'medium',
            title: `No active provider available for ${op}`,
            summary: `No language extension registered a provider for ${op} at the target position.`,
            evidence: [createEvidence('Operation', op, 'BenchmarkRunner')],
            recommendation: createRecommendation({
              id: `REC_NO_PROVIDER_${op.toUpperCase()}`,
              type: 'manualAction',
              title: 'Install appropriate language extension',
              description:
                'Ensure a language extension (e.g. Dart/Flutter, TypeScript) is installed and active for this file type.',
            }),
            detector: 'LanguageDiagnostic',
          })
        );
        break;

      case 'OPTIMAL':
      default:
        break;
    }

    return findings;
  }
}
