import * as vscode from 'vscode';
import { LanguageAdapter } from './LanguageAdapter';
import { GenericLanguageAdapter } from './GenericLanguageAdapter';
import { DartLanguageAdapter } from './DartLanguageAdapter';
import { TypeScriptLanguageAdapter } from './TypeScriptLanguageAdapter';

export class AdapterRegistry {
  private adapters: LanguageAdapter[] = [];
  private genericAdapter = new GenericLanguageAdapter();
  private dartAdapter = new DartLanguageAdapter();
  private tsAdapter = new TypeScriptLanguageAdapter();

  constructor(registerDefaults = false) {
    this.register(this.genericAdapter);
    if (registerDefaults) {
      this.registerDefaultAdapters();
    }
  }

  public registerDefaultAdapters(): void {
    this.adapters = [];
    this.register(this.genericAdapter);
    this.register(this.tsAdapter);
    this.register(this.dartAdapter);
  }

  public register(adapter: LanguageAdapter): void {
    // Prepend so specialized adapters take priority over generic
    this.adapters.unshift(adapter);
  }

  public unregister(adapterId: string): boolean {
    const idx = this.adapters.findIndex((a) => a.id === adapterId);
    if (idx >= 0) {
      this.adapters.splice(idx, 1);
      return true;
    }
    return false;
  }

  public reset(): void {
    this.registerDefaultAdapters();
  }

  public resetToGeneric(): void {
    this.adapters = [this.genericAdapter];
  }

  public getAdapter(uri: vscode.Uri, languageId?: string): LanguageAdapter {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(uri, languageId)) {
        return adapter;
      }
    }
    return this.genericAdapter;
  }

  public getAllAdapters(): readonly LanguageAdapter[] {
    return this.adapters;
  }

  public getGenericAdapter(): LanguageAdapter {
    return this.genericAdapter;
  }
}

export const adapterRegistry = new AdapterRegistry(true);
