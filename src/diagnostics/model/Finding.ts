import { Evidence } from './Evidence';
import { Recommendation } from './Recommendation';

export type FindingCategory =
  'workspace' | 'filesystem' | 'search' | 'languageServer' | 'extension' | 'index' | 'navigation';

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type FindingConfidence = 'low' | 'medium' | 'high';

export interface FindingSourceMetadata {
  ruleId: string;
  detector?: string;
  target?: string;
  details?: Record<string, unknown>;
}

export interface PerformanceFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  title: string;
  summary: string;
  evidence: Evidence[];
  recommendation?: Recommendation;
  sourceMetadata?: FindingSourceMetadata;
  createdAt: number;
}

export function generateFindingId(ruleId: string, target?: string): string {
  const normalizedRule = ruleId.trim().toUpperCase();
  if (!target) {
    return normalizedRule;
  }
  const normalizedTarget = target
    .trim()
    .replace(/[\\/]+/g, '/')
    .replace(/^\/|\/$/g, '');
  return `${normalizedRule}:${normalizedTarget}`;
}

export function createFinding(params: {
  ruleId: string;
  target?: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  title: string;
  summary: string;
  evidence: Evidence[];
  recommendation?: Recommendation;
  detector?: string;
  details?: Record<string, unknown>;
  createdAt?: number;
}): PerformanceFinding {
  const id = generateFindingId(params.ruleId, params.target);
  return {
    id,
    category: params.category,
    severity: params.severity,
    confidence: params.confidence,
    title: params.title,
    summary: params.summary,
    evidence: [...params.evidence],
    recommendation: params.recommendation,
    sourceMetadata: {
      ruleId: params.ruleId,
      detector: params.detector,
      target: params.target,
      details: params.details ? { ...params.details } : undefined,
    },
    createdAt: params.createdAt ?? Date.now(),
  };
}

export function serializeFinding(finding: PerformanceFinding): string {
  return JSON.stringify(finding);
}

export function deserializeFinding(raw: string): PerformanceFinding {
  const parsed = JSON.parse(raw);
  if (
    !parsed.id ||
    !parsed.category ||
    !parsed.severity ||
    !parsed.confidence ||
    !parsed.title ||
    !parsed.summary ||
    !Array.isArray(parsed.evidence)
  ) {
    throw new Error('Invalid PerformanceFinding JSON payload: missing required fields');
  }

  return {
    id: String(parsed.id),
    category: parsed.category,
    severity: parsed.severity,
    confidence: parsed.confidence,
    title: String(parsed.title),
    summary: String(parsed.summary),
    evidence: parsed.evidence,
    recommendation: parsed.recommendation,
    sourceMetadata: parsed.sourceMetadata,
    createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
  };
}
