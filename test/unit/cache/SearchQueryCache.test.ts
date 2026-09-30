import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { SearchQueryCache } from '../../../src/cache/SearchQueryCache';
import { SearchResult } from '../../../src/search/models/SearchResult';
import { eventBus } from '../../../src/core/events/EventBus';

function makeMockResult(label: string): SearchResult {
  return {
    id: label,
    category: 'file',
    score: 0.8,
    uri: vscode.Uri.file(`/workspace/${label}`),
    label,
    fileName: label,
    fsPath: `/workspace/${label}`,
    relativePath: label,
  };
}

describe('SearchQueryCache', () => {
  let cache: SearchQueryCache;

  beforeEach(() => {
    cache = new SearchQueryCache(10);
  });

  it('stores and retrieves cached search results', () => {
    const res = [makeMockResult('User.ts')];
    cache.set('user', res, 'file');

    expect(cache.get('user', 'file')).toEqual(res);
    expect(cache.get('user', 'symbol')).toBeUndefined();
  });

  it('reuses candidate results from query prefix', () => {
    const res = [makeMockResult('UserService.ts'), makeMockResult('UserDao.ts')];
    cache.set('user', res, 'file');

    // Searching 'userService' can find prefix 'user'
    const prefixRes = cache.findPrefixMatch('userService', 'file');
    expect(prefixRes).toEqual(res);
  });

  it('clears on file events', () => {
    cache.set('user', [makeMockResult('User.ts')]);
    eventBus.emit('fileChanged', { uri: 'file:///User.ts', fsPath: '/User.ts' });

    expect(cache.get('user')).toBeUndefined();
  });
});
