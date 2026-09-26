import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import { TypeScriptLanguageAdapter } from '../../../../src/index/adapters/TypeScriptLanguageAdapter';

describe('TypeScriptLanguageAdapter', () => {
  let adapter: TypeScriptLanguageAdapter;

  beforeEach(() => {
    adapter = new TypeScriptLanguageAdapter();
  });

  describe('P8.5: Detection & File Rules', () => {
    it('handles ts, tsx, js, jsx files and languages', () => {
      expect(adapter.canHandle(vscode.Uri.file('/app/src/index.ts'), 'typescript')).toBe(true);
      expect(adapter.canHandle(vscode.Uri.file('/app/src/Component.tsx'), 'typescriptreact')).toBe(
        true
      );
      expect(adapter.canHandle(vscode.Uri.file('/app/src/util.js'), 'javascript')).toBe(true);
      expect(adapter.canHandle(vscode.Uri.file('/app/src/main.dart'))).toBe(false);
    });

    it('excludes node_modules, dist, out, and build directories', () => {
      expect(adapter.canHandle(vscode.Uri.file('/app/node_modules/pkg/index.ts'))).toBe(false);
      expect(adapter.canHandle(vscode.Uri.file('/app/dist/bundle.js'))).toBe(false);
      expect(adapter.canHandle(vscode.Uri.file('/app/build/main.js'))).toBe(false);
    });
  });

  describe('P8.5: Symbol Support', () => {
    it('extracts class, interface, type, function, method, and variable', async () => {
      const tsSource = `
export interface UserConfig {
  name: string;
}

export type UserId = string | number;

export const API_VERSION = 'v1';

export class UserService {
  private config: UserConfig;

  constructor(cfg: UserConfig) {
    this.config = cfg;
  }

  public async getUser(id: UserId): Promise<UserConfig> {
    return this.config;
  }
}

export function createService(cfg: UserConfig): UserService {
  return new UserService(cfg);
}

export const helperFn = () => true;
`;

      const uri = vscode.Uri.file('/workspace/src/user.ts');
      const symbols = await adapter.extractSymbols(uri, 'file-ts', tsSource);
      const symbolMap = new Map(symbols.map((s) => [s.name, s]));

      // Interface
      expect(symbolMap.has('UserConfig')).toBe(true);
      expect(symbolMap.get('UserConfig')?.kind).toBe('interface');

      // Type alias
      expect(symbolMap.has('UserId')).toBe(true);
      expect(symbolMap.get('UserId')?.kind).toBe('type');

      // Constant / variable
      expect(symbolMap.has('API_VERSION')).toBe(true);
      expect(symbolMap.get('API_VERSION')?.kind).toBe('variable');

      // Class
      expect(symbolMap.has('UserService')).toBe(true);
      expect(symbolMap.get('UserService')?.kind).toBe('class');

      // Methods inside class
      expect(symbolMap.has('getUser')).toBe(true);
      expect(symbolMap.get('getUser')?.kind).toBe('method');
      expect(symbolMap.get('getUser')?.containerName).toBe('UserService');

      // Top-level Functions
      expect(symbolMap.has('createService')).toBe(true);
      expect(symbolMap.get('createService')?.kind).toBe('function');

      expect(symbolMap.has('helperFn')).toBe(true);
      expect(symbolMap.get('helperFn')?.kind).toBe('function');
    });
  });

  describe('P8.5: Imports & Dependency Edges', () => {
    it('extracts imports and exports and generates dependency edges', async () => {
      const tsSource = `
import * as path from 'path';
import { UserService } from './UserService';
import { UserConfig } from '../models/UserConfig';
export { helperFn } from './utils';
`;
      const uri = vscode.Uri.file('/workspace/src/services/auth.ts');
      const imports = await adapter.extractImports(uri, tsSource);

      expect(imports.length).toBeGreaterThanOrEqual(3);

      const userServ = imports.find((i) => i.uri === './UserService');
      expect(userServ).toBeDefined();
      expect(userServ?.resolvedPath).toBe(
        path.resolve('/workspace/src/services', './UserService.ts').replace(/\\/g, '/')
      );

      const edges = await adapter.getDependencyEdges(uri, tsSource);
      expect(edges.length).toBeGreaterThanOrEqual(2);
      expect(edges.some((e) => e.type === 'import')).toBe(true);
      expect(edges.some((e) => e.type === 'export')).toBe(true);
    });
  });
});
