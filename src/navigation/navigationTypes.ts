import * as vscode from 'vscode';
import { SymbolRecord } from '../index/models/SymbolRecord';

export interface ResolvedCursorSymbol {
  name: string;
  qualifiedName?: string;
  containerName?: string;
  range: vscode.Range;
}

export type NavigationConfidence = 'high' | 'medium' | 'low';

export interface DefinitionCandidate {
  uri: vscode.Uri;
  range: vscode.Range;
  symbol: SymbolRecord;
  confidence: NavigationConfidence;
  score: number;
  matchType: 'exact' | 'container_match' | 'fuzzy';
  source: 'local_index' | 'native';
}

export type ReferenceStatus = 'candidate' | 'confirmed';
export type ReferenceSource = 'index' | 'native' | 'textSearch';

export interface ReferenceItem {
  uri: vscode.Uri;
  range: vscode.Range;
  status: ReferenceStatus;
  source: ReferenceSource;
  previewLine?: string;
  containerName?: string;
}
