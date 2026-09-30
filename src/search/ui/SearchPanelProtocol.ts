import { SearchMode } from '../../core/interfaces/ISearchService';
import { IndexReadinessState } from '../../core/interfaces/IProjectIndexService';
import { SearchCategory } from '../models/SearchResult';

export interface SearchFilterState {
  kind?: string;
  path?: string;
  ext?: string;
  lang?: string;
}

export interface SearchResultViewModel {
  id: string;
  category: SearchCategory;
  score: number;
  uri: string;
  fsPath: string;
  label: string;
  description?: string;
  detail?: string;
  symbolKind?: string;
  relativePath?: string;
  fileName?: string;
  name?: string;
  kind?: string;
  containerName?: string;
  line?: number;
  column?: number;
  lineText?: string;
  matchLength?: number;
}

export type WebviewToExtensionMessage =
  | {
      type: 'search';
      query: string;
      mode: SearchMode;
      seq: number;
      filters?: SearchFilterState;
    }
  | { type: 'openResult'; id: string; toSide?: boolean }
  | { type: 'changeMode'; mode: SearchMode }
  | { type: 'requestPreview'; id: string }
  | { type: 'getHistory' }
  | { type: 'dismiss' };

export type ExtensionToWebviewMessage =
  | {
      type: 'setResults';
      query: string;
      mode: SearchMode;
      seq: number;
      results: SearchResultViewModel[];
      executionMs: number;
      total: number;
    }
  | {
      type: 'setPreview';
      id: string;
      snippet?: {
        filePath: string;
        startLine: number;
        endLine: number;
        highlightLine?: number;
        lines: string[];
      };
    }
  | { type: 'setHistory'; items: string[] }
  | { type: 'setReadiness'; state: IndexReadinessState }
  | { type: 'setMode'; mode: SearchMode }
  | { type: 'setError'; message: string };

const MODES = new Set<SearchMode>(['all', 'class', 'file', 'symbol', 'text']);
const FILTER_KEYS = new Set(['kind', 'path', 'ext', 'lang']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function parseMode(value: unknown): SearchMode | undefined {
  return typeof value === 'string' && MODES.has(value as SearchMode)
    ? (value as SearchMode)
    : undefined;
}

function parseFilters(value: unknown): SearchFilterState | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || !Object.keys(value).every((key) => FILTER_KEYS.has(key))) {
    return undefined;
  }
  for (const filter of Object.values(value)) {
    if (filter !== undefined && !isBoundedString(filter, 200)) {
      return undefined;
    }
  }
  return value as SearchFilterState;
}

export function parseWebviewMessage(input: unknown): WebviewToExtensionMessage | undefined {
  if (!isRecord(input) || typeof input.type !== 'string') {
    return undefined;
  }

  switch (input.type) {
    case 'search': {
      if (!hasOnlyKeys(input, ['type', 'query', 'mode', 'seq', 'filters'])) {
        return undefined;
      }
      const mode = parseMode(input.mode);
      const filters = parseFilters(input.filters);
      if (
        !isBoundedString(input.query, 500) ||
        !mode ||
        !Number.isSafeInteger(input.seq) ||
        (input.seq as number) < 0 ||
        (input.filters !== undefined && filters === undefined)
      ) {
        return undefined;
      }
      return { type: 'search', query: input.query, mode, seq: input.seq as number, filters };
    }
    case 'openResult':
      if (
        !hasOnlyKeys(input, ['type', 'id', 'toSide']) ||
        !isBoundedString(input.id, 2048) ||
        (input.toSide !== undefined && typeof input.toSide !== 'boolean')
      ) {
        return undefined;
      }
      return { type: 'openResult', id: input.id, toSide: input.toSide as boolean | undefined };
    case 'changeMode': {
      const mode = parseMode(input.mode);
      return hasOnlyKeys(input, ['type', 'mode']) && mode
        ? { type: 'changeMode', mode }
        : undefined;
    }
    case 'requestPreview':
      return hasOnlyKeys(input, ['type', 'id']) && isBoundedString(input.id, 2048)
        ? { type: 'requestPreview', id: input.id }
        : undefined;
    case 'getHistory':
    case 'dismiss':
      return hasOnlyKeys(input, ['type']) ? { type: input.type } : undefined;
    default:
      return undefined;
  }
}
