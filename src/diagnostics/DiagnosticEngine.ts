import { PerformanceFinding, FindingSeverity, FindingConfidence } from './model/Finding';
import { DiagnosticContext, DiagnosticRule } from './rules/ruleTypes';
import { watcherRule001 } from './rules/watcherRules';
import { searchRule001 } from './rules/searchRules';
import { workspaceRule001, workspaceRule002 } from './rules/workspaceRules';
import { fileRule001, fileRule002 } from './rules/fileRules';
import { indexRule001 } from './rules/indexRules';
import { stateStore } from '../core/state/StateStore';
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

export class DiagnosticEngine {
  private rules: DiagnosticRule[] = [];

  constructor(customRules?: DiagnosticRule[]) {
    if (customRules) {
      this.rules = [...customRules];
    } else {
      this.rules = [
        watcherRule001,
        searchRule001,
        workspaceRule001,
        workspaceRule002,
        fileRule001,
        fileRule002,
        indexRule001,
      ];
    }
  }

  public registerRule(rule: DiagnosticRule): void {
    this.rules.push(rule);
  }

  public analyze(context: DiagnosticContext): PerformanceFinding[] {
    const findings: PerformanceFinding[] = [];

    for (const rule of this.rules) {
      try {
        const ruleFindings = rule.evaluate(context);
        findings.push(...ruleFindings);
      } catch (err) {
        logger.error(`Error executing diagnostic rule ${rule.id}`, { error: String(err) });
      }
    }

    const sortedFindings = this.sortFindings(findings);
    stateStore.updateFindings(sortedFindings);
    return sortedFindings;
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

export const diagnosticEngine = new DiagnosticEngine();
