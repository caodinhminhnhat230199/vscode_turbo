export interface Evidence {
  label: string;
  value: string | number;
  unit?: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export function createEvidence(
  label: string,
  value: string | number,
  source: string,
  unit?: string,
  metadata?: Record<string, unknown>
): Evidence {
  return {
    label,
    value,
    source,
    ...(unit !== undefined ? { unit } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

export function serializeEvidence(evidence: Evidence): string {
  return JSON.stringify(evidence);
}

export function deserializeEvidence(raw: string): Evidence {
  const parsed = JSON.parse(raw);
  if (!parsed.label || parsed.value === undefined || !parsed.source) {
    throw new Error('Invalid Evidence JSON payload: missing required fields');
  }
  return {
    label: String(parsed.label),
    value: parsed.value,
    unit: parsed.unit ? String(parsed.unit) : undefined,
    source: String(parsed.source),
    metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : undefined,
  };
}
