import { describe, it, expect, beforeEach } from 'vitest';
import { SearchHistoryService } from '../../../src/search/history/SearchHistoryService';

describe('SearchHistoryService', () => {
  let service: SearchHistoryService;

  beforeEach(() => {
    service = new SearchHistoryService();
  });

  it('records queries in LIFO order without duplicates', () => {
    service.recordQuery('user');
    service.recordQuery('auth');
    service.recordQuery('user');

    const recents = service.getRecentQueries();
    expect(recents).toEqual(['user', 'auth']);
  });

  it('records selection frequencies and recency', () => {
    service.recordSelection('/workspace/src/app.ts');
    service.recordSelection('/workspace/src/app.ts');
    service.recordSelection('/workspace/src/login.ts');

    const freqs = service.getFrequentlySelectedPaths();
    expect(freqs.get('/workspace/src/app.ts')).toBe(2);
    expect(freqs.get('/workspace/src/login.ts')).toBe(1);

    const recents = service.getRecentlySelectedPaths();
    expect(recents.has('/workspace/src/app.ts')).toBe(true);
  });
});
