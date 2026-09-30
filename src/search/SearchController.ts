import * as vscode from 'vscode';
import { SearchService, searchService } from './SearchService';
import { SearchQueryRequest } from '../core/interfaces/ISearchService';
import { SearchResult } from './models/SearchResult';
import { searchHistoryService } from './history/SearchHistoryService';
import { projectIndexService } from '../index/ProjectIndexService';
import { IndexReadinessState } from '../core/interfaces/IProjectIndexService';

export class SearchController {
  private static instance: SearchController | null = null;
  private service: SearchService;

  public static getInstance(service?: SearchService): SearchController {
    if (!SearchController.instance) {
      SearchController.instance = new SearchController(service ?? searchService);
    }
    return SearchController.instance;
  }

  constructor(service: SearchService = searchService) {
    this.service = service;
  }

  public async search(request: SearchQueryRequest): Promise<SearchResult[]> {
    return this.service.search(request);
  }

  public cancel(sessionId?: string): void {
    this.service.cancel(sessionId);
  }

  public getReadiness(): IndexReadinessState {
    return projectIndexService.getReadiness();
  }

  public async openResult(
    result: SearchResult,
    options?: { viewColumn?: vscode.ViewColumn }
  ): Promise<vscode.TextEditor | undefined> {
    searchHistoryService.recordSelection(result.uri.fsPath);

    const doc = await vscode.workspace.openTextDocument(result.uri);
    const editor = await vscode.window.showTextDocument(doc, options);

    if ('line' in result && typeof result.line === 'number') {
      const line = Math.max(0, result.line);
      const col =
        'column' in result && typeof result.column === 'number' ? Math.max(0, result.column) : 0;
      const pos = new vscode.Position(line, col);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }

    return editor;
  }
}

export const searchController = SearchController.getInstance();
