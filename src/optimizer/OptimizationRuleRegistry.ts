import {
  PerformanceFinding,
  FindingSeverity,
  FindingConfidence,
} from '../diagnostics/model/Finding';
import { OptimizationRule, OptimizationContext } from './OptimizationRule';
import { logger } from '../core/logging/Logger';

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const CONFIDENCE_WEIGHT: Record<FindingConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export class OptimizationRuleRegistry {
  private rules: Map<string, OptimizationRule> = new Map();

  public register(rule: OptimizationRule): void {
    this.rules.set(rule.id, rule);
  }

  public unregister(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  public getRules(): readonly OptimizationRule[] {
    return Array.from(this.rules.values());
  }

  public clear(): void {
    this.rules.clear();
  }

  public async evaluateAll(context: OptimizationContext): Promise<PerformanceFinding[]> {
    const findings: PerformanceFinding[] = [];
    const ruleList = Array.from(this.rules.values());

    const results = await Promise.allSettled(
      ruleList.map(async (rule) => {
        try {
          const result = await rule.evaluate(context);
          if (!result) {
            return [];
          }
          return Array.isArray(result) ? result : [result];
        } catch (err) {
          logger.error(`Optimization rule ${rule.id} failed during evaluation`, {
            error: String(err),
          });
          return [];
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        findings.push(...r.value);
      }
    }

    return this.sortFindings(findings);
  }

  public sortFindings(findings: PerformanceFinding[]): PerformanceFinding[] {
    return [...findings].sort((a, b) => {
      const severityDiff = (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      const confDiff =
        (CONFIDENCE_WEIGHT[b.confidence] ?? 0) - (CONFIDENCE_WEIGHT[a.confidence] ?? 0);
      if (confDiff !== 0) {
        return confDiff;
      }

      return b.createdAt - a.createdAt;
    });
  }
}

export const optimizationRuleRegistry = new OptimizationRuleRegistry();
