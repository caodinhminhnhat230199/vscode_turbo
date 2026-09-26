import { describe, it, expect, beforeEach } from 'vitest';
import { OptimizationRuleRegistry } from '../../../src/optimizer/OptimizationRuleRegistry';
import { OptimizationRule, OptimizationContext } from '../../../src/optimizer/OptimizationRule';
import { createFinding, PerformanceFinding } from '../../../src/diagnostics/model/Finding';

describe('OptimizationRuleRegistry', () => {
  let registry: OptimizationRuleRegistry;

  beforeEach(() => {
    registry = new OptimizationRuleRegistry();
  });

  it('registers and unregisters rules correctly', () => {
    const rule: OptimizationRule = {
      id: 'TEST_001',
      evaluate: async () => null,
    };

    registry.register(rule);
    expect(registry.getRules()).toHaveLength(1);
    expect(registry.getRules()[0].id).toBe('TEST_001');

    const unregistered = registry.unregister('TEST_001');
    expect(unregistered).toBe(true);
    expect(registry.getRules()).toHaveLength(0);
  });

  it('evaluates rules independently without aborting when one fails', async () => {
    const failingRule: OptimizationRule = {
      id: 'FAIL_RULE',
      evaluate: async () => {
        throw new Error('Simulated rule failure');
      },
    };

    const passingRule: OptimizationRule = {
      id: 'PASS_RULE',
      evaluate: async (_ctx: OptimizationContext) => {
        return createFinding({
          ruleId: 'PASS_RULE',
          category: 'filesystem',
          severity: 'medium',
          confidence: 'high',
          title: 'Passing Rule Finding',
          summary: 'Evaluated successfully despite failing sibling',
          evidence: [],
        });
      },
    };

    registry.register(failingRule);
    registry.register(passingRule);

    const findings = await registry.evaluateAll({});
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('PASS_RULE');
  });

  it('sorts findings by severity (critical > high > medium > low > info) and confidence', async () => {
    const rule: OptimizationRule = {
      id: 'MULTI_FINDING_RULE',
      evaluate: async (): Promise<PerformanceFinding[]> => {
        return [
          createFinding({
            ruleId: 'F_LOW',
            category: 'filesystem',
            severity: 'low',
            confidence: 'medium',
            title: 'Low Finding',
            summary: 'Low severity',
            evidence: [],
          }),
          createFinding({
            ruleId: 'F_CRIT',
            category: 'filesystem',
            severity: 'critical',
            confidence: 'high',
            title: 'Critical Finding',
            summary: 'Critical severity',
            evidence: [],
          }),
          createFinding({
            ruleId: 'F_HIGH',
            category: 'filesystem',
            severity: 'high',
            confidence: 'high',
            title: 'High Finding',
            summary: 'High severity',
            evidence: [],
          }),
          createFinding({
            ruleId: 'F_INFO',
            category: 'filesystem',
            severity: 'info',
            confidence: 'low',
            title: 'Info Finding',
            summary: 'Info severity',
            evidence: [],
          }),
          createFinding({
            ruleId: 'F_MED',
            category: 'filesystem',
            severity: 'medium',
            confidence: 'high',
            title: 'Medium Finding',
            summary: 'Medium severity',
            evidence: [],
          }),
        ];
      },
    };

    registry.register(rule);
    const findings = await registry.evaluateAll({});

    expect(findings.map((f) => f.severity)).toEqual(['critical', 'high', 'medium', 'low', 'info']);
  });
});
