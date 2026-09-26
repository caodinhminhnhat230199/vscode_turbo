import * as vscode from 'vscode';
import { SymbolRecord } from '../models/SymbolRecord';

export interface AdapterCapabilities {
  supportsSymbols?: boolean;
  supportsWarmup?: boolean;
  supportsImports?: boolean;
  supportsReferences?: boolean;
  supportsDependencyGraph?: boolean;
  supportsDocumentSymbols?: boolean;
  supportsFastFallback?: boolean;
}

export interface ImportDirective {
  uri: string;
  resolvedPath?: string;
  isExport?: boolean;
  line: number;
}

export interface DependencyEdge {
  fromFile: string;
  toFile: string;
  type: 'import' | 'export';
}

export interface LanguageAdapter {
  readonly id: string;
  readonly supportedLanguages: string[];
  readonly capabilities: AdapterCapabilities;

  canHandle(uri: vscode.Uri, languageId?: string): boolean;
  extractSymbols(uri: vscode.Uri, fileId: string, content?: string): Promise<SymbolRecord[]>;
  extractImports?(uri: vscode.Uri, content?: string): Promise<ImportDirective[]>;
  getDependencyEdges?(uri: vscode.Uri, content?: string): Promise<DependencyEdge[]>;
  warmup?(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<void>;
  getWarmupCandidates?(workspaceRoot: string): Promise<string[]>;
  resolveSymbolAtPosition?(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { name: string; qualifiedName?: string; containerName?: string; range: vscode.Range } | null;
}
