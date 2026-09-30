import { describe, it, expect, beforeEach } from 'vitest';
import { SearchService } from '../../../src/search/SearchService';
import { searchQueryCache } from '../../../src/cache/SearchQueryCache';
import { searchDiagnostics } from '../../../src/search/diagnostics/SearchDiagnostics';
import * as vscode from 'vscode';

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    searchQueryCache.clear();
    searchDiagnostics.clear();
    service = new SearchService();
  });

  it('returns empty array for empty query', async () => {
    const results = await service.search({ query: '' });
    expect(results).toEqual([]);
  });

  it('executes search across multiple modes', async () => {
    const results = await service.search({
      query: 'Service',
      mode: 'file',
    });
    expect(Array.isArray(results)).toBe(true);
  });

  it('does not reuse unscoped cached results for a contextual search', async () => {
    const internals = service as any;
    internals.fileEngine = {
      search: async () => [
        {
          id: 'file:a',
          category: 'file',
          score: 1,
          uri: { fsPath: '/workspace/a.ts', path: '/workspace/a.ts' },
          label: 'a.ts',
          description: '',
          detail: '/workspace/a.ts',
          fsPath: '/workspace/a.ts',
          relativePath: 'a.ts',
          fileName: 'a.ts',
        },
      ],
    };

    const cachedResults = await service.search({ query: 'ab', mode: 'file' });
    internals.fileEngine = { search: async () => [] };

    const contextualResults = await service.search({
      query: 'ab',
      mode: 'file',
      options: { activeFileUri: { fsPath: '/workspace/a.ts', path: '/workspace/a.ts' } as any },
    });

    expect(cachedResults).toHaveLength(1);
    expect(contextualResults).toEqual([]);
  });

  it('reuses prefix cached candidates on subsequent query refinement', async () => {
    const internals = service as any;
    let callCount = 0;
    internals.fileEngine = {
      search: async () => {
        callCount++;
        return [
          {
            id: 'file:user-service',
            category: 'file',
            score: 0.9,
            uri: { fsPath: '/workspace/UserService.ts', path: '/workspace/UserService.ts' },
            label: 'UserService.ts',
            fileName: 'UserService.ts',
            relativePath: 'src/UserService.ts',
          },
          {
            id: 'file:order-service',
            category: 'file',
            score: 0.8,
            uri: { fsPath: '/workspace/OrderService.ts', path: '/workspace/OrderService.ts' },
            label: 'OrderService.ts',
            fileName: 'OrderService.ts',
            relativePath: 'src/OrderService.ts',
          },
        ];
      },
    };

    // First search caches candidates for 'user'
    const res1 = await service.search({ query: 'user', mode: 'file' });
    expect(res1).toHaveLength(2);
    expect(callCount).toBe(1);

    // Second search for 'userservice' should hit prefix candidates from 'user' cache
    const res2 = await service.search({ query: 'userservice', mode: 'file' });
    expect(res2).toHaveLength(1);
    expect(res2[0].label).toBe('UserService.ts');
    // Engines not called again because candidates filtered from prefix cache
    expect(callCount).toBe(1);
  });

  it('cancels previous search session on rapid typing', async () => {
    const internals = service as any;
    const sessionId = 'session-keystroke-test';

    let slowStarted = false;
    internals.fileEngine = {
      search: async (_query: string, options?: any) => {
        if (_query === 'u') {
          slowStarted = true;
          // Simulate latency
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (options?.cancellationToken?.isCancellationRequested) {
            return [];
          }
          return [
            {
              id: 'file:u',
              category: 'file',
              score: 0.5,
              uri: { fsPath: '/u.ts', path: '/u.ts' },
              label: 'u.ts',
            },
          ];
        }
        return [
          {
            id: 'file:user',
            category: 'file',
            score: 1.0,
            uri: { fsPath: '/User.ts', path: '/User.ts' },
            label: 'User.ts',
          },
        ];
      },
    };

    // Fire first search
    const p1 = service.search({ query: 'u', mode: 'file', sessionId });
    // Fire second search immediately
    const p2 = service.search({ query: 'user', mode: 'file', sessionId });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(slowStarted).toBe(true);
    expect(r1).toEqual([]); // cancelled
    expect(r2).toHaveLength(1);
    expect(r2[0].label).toBe('User.ts');
  });

  it('disposes external cancellation listeners after a completed search', async () => {
    const internals = service as any;
    internals.fileEngine = { search: async () => [] };
    const external = new vscode.CancellationTokenSource();

    await service.search({
      query: 'cleanup',
      mode: 'file',
      sessionId: 'listener-cleanup',
      options: { cancellationToken: external.token },
    });

    expect((external as any)._listeners).toHaveLength(0);
    expect(internals.activeSessions.size).toBe(0);
  });
});
