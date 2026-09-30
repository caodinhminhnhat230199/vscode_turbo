import * as vscode from 'vscode';
import { ISearchService, SearchMode, SearchQueryRequest } from '../core/interfaces/ISearchService';
import { SearchResult } from './models/SearchResult';
import { SearchOptions } from './models/SearchOptions';
import { FileSearchEngine } from './engine/FileSearchEngine';
import { SymbolSearchEngine } from './engine/SymbolSearchEngine';
import { ClassSearchEngine } from './engines/ClassSearchEngine';
import { TextSearchEngine } from './engines/TextSearchEngine';
import { SearchResultMerger } from './engine/SearchResultMerger';
import { QueryParser } from './QueryParser';
import { RankingEngine } from './ranking/RankingEngine';
import { searchQueryCache, CacheKeyOptions } from '../cache/SearchQueryCache';
import { searchHistoryService } from './history/SearchHistoryService';
import { searchDiagnostics } from './diagnostics/SearchDiagnostics';
import { resourceScheduler } from '../scheduler/ResourceScheduler';
import { JobPriority, ScheduledJob } from '../scheduler/JobTypes';
import { eventBus } from '../core/events/EventBus';
import { projectIndexService } from '../index/ProjectIndexService';
import { IndexStore } from '../index/store/IndexStore';
import { logger } from '../core/logging/Logger';

interface ExecutionResult {
  results: SearchResult[];
  fetchMs: number;
  mergeMs: number;
  rankingMs: number;
}

export class SearchService implements ISearchService {
  private static instance: SearchService | null = null;

  private fileEngine: FileSearchEngine;
  private symbolEngine: SymbolSearchEngine;
  private classEngine: ClassSearchEngine;
  private textEngine: TextSearchEngine;
  private activeSessions = new Map<string, vscode.CancellationTokenSource>();
  private requestSequence = 0;

  public static getInstance(storeProvider?: () => IndexStore): SearchService {
    if (!SearchService.instance) {
      SearchService.instance = new SearchService(storeProvider);
    }
    return SearchService.instance;
  }

  constructor(storeProvider?: () => IndexStore) {
    const provider = storeProvider ?? (() => projectIndexService.getStore());
    this.fileEngine = new FileSearchEngine(provider);
    this.symbolEngine = new SymbolSearchEngine(provider);
    this.classEngine = new ClassSearchEngine(provider);
    this.textEngine = new TextSearchEngine();
  }

  public async search(request: SearchQueryRequest): Promise<SearchResult[]> {
    const rawQuery = request.query.trim();
    if (!rawQuery) {
      return [];
    }

    const readiness = projectIndexService.getReadiness();
    if (readiness === 'indexing') {
      logger.info(
        '[SearchService] Index is indexing. Searching available indexed candidates & fallbacks.'
      );
    } else if (readiness === 'disabled') {
      logger.info('[SearchService] Index is disabled. Fallback file/text search will be used.');
    } else if (readiness === 'error') {
      logger.warn('[SearchService] Index in error state. Searching fallback files/text.');
    }

    const sessionId = request.sessionId ?? `search-${Date.now()}`;
    const startTime = performance.now();

    // Cancel prior in-flight request for the same session
    const prevCts = this.activeSessions.get(sessionId);
    if (prevCts) {
      prevCts.cancel();
      prevCts.dispose();
      this.activeSessions.delete(sessionId);
      resourceScheduler.cancelByGroup(sessionId);
    }

    const sessionCts = new vscode.CancellationTokenSource();
    this.activeSessions.set(sessionId, sessionCts);
    let externalCancellationRegistration: vscode.Disposable | undefined;
    const cleanupSession = (): void => {
      externalCancellationRegistration?.dispose();
      if (this.activeSessions.get(sessionId) === sessionCts) {
        this.activeSessions.delete(sessionId);
      }
      sessionCts.dispose();
    };

    if (request.options?.cancellationToken) {
      if (request.options.cancellationToken.isCancellationRequested) {
        sessionCts.cancel();
        searchDiagnostics.recordCancellation();
        cleanupSession();
        return [];
      }
      externalCancellationRegistration = request.options.cancellationToken.onCancellationRequested(
        () => {
          sessionCts.cancel();
        }
      );
    }

    const mode: SearchMode = request.mode ?? 'all';
    const parseStart = performance.now();
    const parsed = QueryParser.parse(rawQuery);
    const parseMs = performance.now() - parseStart;

    const effectiveQuery = parsed.text || rawQuery;
    const effectiveMode = (parsed.typeFilter as SearchMode) || mode;

    const mergedOptions: SearchOptions = {
      ...request.options,
      cancellationToken: sessionCts.token,
      kindFilter: parsed.kindFilter ?? request.options?.kindFilter,
      pathFilter: parsed.pathFilter ?? request.options?.pathFilter,
      extFilter: parsed.extFilter ?? request.options?.extFilter,
      langFilter: parsed.langFilter ?? request.options?.langFilter,
    };
    const enrichedRequest: SearchQueryRequest = {
      ...request,
      options: mergedOptions,
    };

    const cacheOptions: CacheKeyOptions = {
      workspaceRoots: mergedOptions.workspaceRoots,
      kindFilter: mergedOptions.kindFilter,
      pathFilter: mergedOptions.pathFilter,
      extFilter: mergedOptions.extFilter,
      langFilter: mergedOptions.langFilter,
      activeFile: mergedOptions.activeFileUri?.fsPath,
    };

    const cacheable = this.isCacheable(mergedOptions);
    if (cacheable) {
      const cached = searchQueryCache.get(effectiveQuery, effectiveMode, cacheOptions);
      if (cached) {
        const totalMs = performance.now() - startTime;
        searchDiagnostics.recordQuery({
          query: effectiveQuery,
          mode: effectiveMode,
          parseMs,
          fetchMs: 0,
          rankingMs: 0,
          mergeMs: 0,
          totalMs,
          resultCount: cached.length,
          cacheHit: true,
        });
        cleanupSession();
        return cached;
      }

      // Check prefix match for candidate reuse
      const prefixCandidates = searchQueryCache.findPrefixMatch(
        effectiveQuery,
        effectiveMode,
        cacheOptions
      );
      const limit = mergedOptions.limit ?? 50;
      if (prefixCandidates && prefixCandidates.length < limit) {
        const qLower = effectiveQuery.toLowerCase();
        const filtered = prefixCandidates.filter((c) => {
          if (c.label.toLowerCase().includes(qLower)) {
            return true;
          }
          if (
            'relativePath' in c &&
            typeof c.relativePath === 'string' &&
            c.relativePath.toLowerCase().includes(qLower)
          ) {
            return true;
          }
          if (
            'fileName' in c &&
            typeof c.fileName === 'string' &&
            c.fileName.toLowerCase().includes(qLower)
          ) {
            return true;
          }
          return false;
        });
        const rankStart = performance.now();
        const ranked = RankingEngine.rank(filtered, effectiveQuery, {
          activeFileUri: mergedOptions.activeFileUri?.fsPath,
          recentlyOpenedPaths: searchHistoryService.getRecentlySelectedPaths(),
          frequentlySelectedPaths: searchHistoryService.getFrequentlySelectedPaths(),
        });
        const rankingMs = performance.now() - rankStart;
        const totalMs = performance.now() - startTime;
        searchDiagnostics.recordQuery({
          query: effectiveQuery,
          mode: effectiveMode,
          parseMs,
          fetchMs: 0,
          rankingMs,
          mergeMs: 0,
          totalMs,
          resultCount: ranked.length,
          cacheHit: true,
        });
        searchQueryCache.set(effectiveQuery, ranked, effectiveMode, cacheOptions);
        cleanupSession();
        return ranked;
      }
    }

    eventBus.emit('searchSessionStarted', {
      sessionId,
      query: effectiveQuery,
      mode: effectiveMode,
    });

    const jobId = `search-${sessionId}-${Date.now()}-${++this.requestSequence}`;
    const job: ScheduledJob<ExecutionResult> = {
      id: jobId,
      groupId: sessionId,
      priority: JobPriority.P0_INTERACTIVE_SEARCH,
      type: effectiveMode === 'text' ? 'search_text' : 'search_file',
      execute: async (token?: vscode.CancellationToken) => {
        return this.executeSearch(effectiveQuery, effectiveMode, enrichedRequest, token);
      },
    };

    let execution: ExecutionResult;
    try {
      execution = await resourceScheduler.schedule(job);
    } catch (error) {
      if (
        sessionCts.token.isCancellationRequested ||
        (error as Error)?.name === 'CancellationError'
      ) {
        searchDiagnostics.recordCancellation();
      } else {
        logger.error('[SearchService] Search execution failed', error);
      }
      cleanupSession();
      return [];
    }

    const { results, fetchMs, mergeMs, rankingMs } = execution;
    const totalMs = performance.now() - startTime;

    searchDiagnostics.recordQuery({
      query: effectiveQuery,
      mode: effectiveMode,
      parseMs,
      fetchMs,
      rankingMs,
      mergeMs,
      totalMs,
      resultCount: results.length,
      cacheHit: false,
    });

    eventBus.emit('searchSessionEnded', {
      sessionId,
      query: effectiveQuery,
      mode: effectiveMode,
      durationMs: totalMs,
      resultCount: results.length,
    });

    if (cacheable && !sessionCts.token.isCancellationRequested) {
      searchQueryCache.set(effectiveQuery, results, effectiveMode, cacheOptions);
    }
    searchHistoryService.recordQuery(effectiveQuery);
    cleanupSession();

    return results;
  }

  private async executeSearch(
    query: string,
    mode: SearchMode,
    request: SearchQueryRequest,
    token?: vscode.CancellationToken
  ): Promise<ExecutionResult> {
    const options = request.options;
    const limit = options?.limit ?? 50;

    if (token?.isCancellationRequested) {
      searchDiagnostics.recordCancellation();
      return { results: [], fetchMs: 0, mergeMs: 0, rankingMs: 0 };
    }

    let rawResults: SearchResult[] = [];
    let mergeMs = 0;
    const fetchStart = performance.now();

    if (mode === 'file') {
      rawResults = await this.fileEngine.search(query, options);
    } else if (mode === 'class') {
      rawResults = await this.classEngine.search(query, options);
    } else if (mode === 'symbol') {
      rawResults = await this.symbolEngine.search(query, options);
    } else if (mode === 'text') {
      rawResults = await this.textEngine.search(query, options);
    } else {
      // mode === 'all' (Search Everywhere)
      // Query policy: short query (1-2 chars) does NOT run ripgrep
      const runTextSearch = query.length >= 3;

      const searches: Promise<SearchResult[]>[] = [
        this.fileEngine.search(query, options),
        this.classEngine.search(query, options),
        this.symbolEngine.search(query, options),
      ];

      if (runTextSearch) {
        searches.push(this.textEngine.search(query, { ...options, limit: 30 }));
      }

      const buckets = await Promise.all(searches);
      const mergeStart = performance.now();
      rawResults = SearchResultMerger.merge(buckets, {
        limit: limit * 2,
        categoryFilter: 'all',
      });
      mergeMs = performance.now() - mergeStart;
    }
    const fetchMs = performance.now() - fetchStart;

    if (token?.isCancellationRequested) {
      searchDiagnostics.recordCancellation();
      return { results: [], fetchMs, mergeMs, rankingMs: 0 };
    }

    const rankStart = performance.now();
    const ranked = RankingEngine.rank(rawResults, query, {
      activeFileUri: options?.activeFileUri?.fsPath,
      recentlyOpenedPaths: searchHistoryService.getRecentlySelectedPaths(),
      frequentlySelectedPaths: searchHistoryService.getFrequentlySelectedPaths(),
    });
    const rankingMs = performance.now() - rankStart;

    return {
      results: ranked.slice(0, limit),
      fetchMs,
      mergeMs,
      rankingMs,
    };
  }

  public cancel(sessionId?: string): void {
    if (sessionId) {
      const source = this.activeSessions.get(sessionId);
      source?.cancel();
      source?.dispose();
      this.activeSessions.delete(sessionId);
      resourceScheduler.cancelByGroup(sessionId);
      searchDiagnostics.recordCancellation();
    }
  }

  private isCacheable(options?: SearchOptions): boolean {
    return !options?.includeIgnored;
  }
}

export const searchService = SearchService.getInstance();
