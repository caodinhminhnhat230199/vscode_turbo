export interface SettingChange {
  section: string;
  oldValue: unknown;
  newValue: unknown;
  description: string;
  target?: 'workspace' | 'global' | 'workspaceFolder';
}

export type RecommendationType =
  | 'workspaceSetting'
  | 'vsTurboSetting'
  | 'codePulseSetting'
  | 'manualAction'
  | 'reindex'
  | 'restartLanguageServer';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  safeToAutoApply: boolean;
  requiresReload: boolean;
  changes?: SettingChange[];
  sourceMetadata?: Record<string, unknown>;
}

export function createRecommendation(params: {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  safeToAutoApply?: boolean;
  requiresReload?: boolean;
  changes?: SettingChange[];
  sourceMetadata?: Record<string, unknown>;
}): Recommendation {
  return {
    id: params.id,
    type: params.type,
    title: params.title,
    description: params.description,
    safeToAutoApply: params.safeToAutoApply ?? false,
    requiresReload: params.requiresReload ?? false,
    changes: params.changes ? [...params.changes] : undefined,
    sourceMetadata: params.sourceMetadata ? { ...params.sourceMetadata } : undefined,
  };
}

export function serializeRecommendation(recommendation: Recommendation): string {
  return JSON.stringify(recommendation);
}

export function deserializeRecommendation(raw: string): Recommendation {
  const parsed = JSON.parse(raw);
  if (!parsed.id || !parsed.type || !parsed.title || !parsed.description) {
    throw new Error('Invalid Recommendation JSON payload: missing required fields');
  }
  return {
    id: String(parsed.id),
    type: parsed.type,
    title: String(parsed.title),
    description: String(parsed.description),
    safeToAutoApply: Boolean(parsed.safeToAutoApply),
    requiresReload: Boolean(parsed.requiresReload),
    changes: Array.isArray(parsed.changes) ? parsed.changes : undefined,
    sourceMetadata:
      parsed.sourceMetadata && typeof parsed.sourceMetadata === 'object'
        ? parsed.sourceMetadata
        : undefined,
  };
}
