import { SearchResult } from '../../search/models/SearchResult';
import { SearchOptions } from '../../search/models/SearchOptions';

export type SearchMode = 'all' | 'file' | 'class' | 'symbol' | 'text';

export interface SearchQueryRequest {
  query: string;
  mode?: SearchMode;
  options?: SearchOptions;
  sessionId?: string;
}

export interface ISearchService {
  search(request: SearchQueryRequest): Promise<SearchResult[]>;
  cancel(sessionId?: string): void;
}
