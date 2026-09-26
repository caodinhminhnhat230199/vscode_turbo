import * as vscode from 'vscode';

export type SearchCategory = 'file' | 'symbol' | 'text';

export interface BaseSearchResult {
  id: string;
  category: SearchCategory;
  score: number;
  uri: vscode.Uri;
  label: string;
  description?: string;
  detail?: string;
}

export interface FileSearchResult extends BaseSearchResult {
  category: 'file';
  fsPath: string;
  relativePath: string;
  fileName: string;
}

export interface SymbolSearchResult extends BaseSearchResult {
  category: 'symbol';
  name: string;
  kind: string;
  containerName?: string;
  line: number;
  column: number;
}

export interface TextSearchResult extends BaseSearchResult {
  category: 'text';
  line: number;
  column: number;
  lineText: string;
  matchLength: number;
}

export type SearchResult = FileSearchResult | SymbolSearchResult | TextSearchResult;
