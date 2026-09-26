import { BenchmarkResult, LatencyCategory } from './benchmarkTypes';

export interface ColdWarmThresholds {
  coldP50Ms?: number;
  warmP50Ms?: number;
  persistentSlowMs?: number;
}

export class ColdWarmClassifier {
  public static classify(
    result: BenchmarkResult,
    thresholds: ColdWarmThresholds = {}
  ): LatencyCategory {
    const coldThreshold = thresholds.coldP50Ms ?? 2000;
    const warmThreshold = thresholds.warmP50Ms ?? 300;
    const slowThreshold = thresholds.persistentSlowMs ?? 800;

    if (result.timeoutCount && result.timeoutCount > 0) {
      return 'PROVIDER_TIMEOUT';
    }

    if (
      result.sampleCount === 0 ||
      (result.errorCount !== undefined && result.errorCount >= (result.samples?.length ?? 1))
    ) {
      return 'NO_PROVIDER';
    }

    // First sample (cold run) vs measured warm P50
    const firstSampleMs =
      result.samples && result.samples.length > 0 ? result.samples[0].durationMs : 0;
    const warmP50 = result.p50Ms;

    if (firstSampleMs >= coldThreshold && warmP50 <= warmThreshold) {
      return 'LANGUAGE_COLD_START';
    }

    if (warmP50 > slowThreshold) {
      return 'LANGUAGE_PERSISTENT_SLOW';
    }

    return 'OPTIMAL';
  }
}
