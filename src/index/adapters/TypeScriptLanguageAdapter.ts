import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  LanguageAdapter,
  AdapterCapabilities,
  ImportDirective,
  DependencyEdge,
} from './LanguageAdapter';
import { SymbolRecord, createSymbolRecord } from '../models/SymbolRecord';
import { logger } from '../../core/logging/Logger';

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

export class TypeScriptLanguageAdapter implements LanguageAdapter {
  public readonly id = 'typescript-adapter';
  public readonly supportedLanguages = [
    'typescript',
    'typescriptreact',
    'javascript',
    'javascriptreact',
  ];
  public readonly capabilities: AdapterCapabilities = {
    supportsSymbols: true,
    supportsWarmup: true,
    supportsImports: true,
    supportsReferences: true,
    supportsDependencyGraph: true,
    supportsDocumentSymbols: true,
    supportsFastFallback: true,
  };

  public canHandle(uri: vscode.Uri, languageId?: string): boolean {
    const filePath = uri.fsPath.replace(/\\/g, '/');

    // 1. Language check
    if (languageId && this.supportedLanguages.includes(languageId)) {
      return true;
    }

    // 2. Extension check
    const hasTsExt = TS_EXTENSIONS.some((ext) => filePath.endsWith(ext));
    if (!hasTsExt) {
      return false;
    }

    // 3. Exclude dependency & build dirs
    if (/\/(node_modules|dist|out|build|coverage)(\/|$)/i.test(filePath)) {
      return false;
    }

    return true;
  }

  public async extractSymbols(
    uri: vscode.Uri,
    fileId: string,
    content?: string
  ): Promise<SymbolRecord[]> {
    let text = content;
    if (text === undefined) {
      try {
        text = await fs.promises.readFile(uri.fsPath, 'utf8');
      } catch (err) {
        logger.debug(`Failed to read TS file: ${uri.fsPath}`, { error: String(err) });
        return [];
      }
    }

    return this.parseTypeScriptSymbols(text, fileId);
  }

  public async extractImports(uri: vscode.Uri, content?: string): Promise<ImportDirective[]> {
    let text = content;
    if (text === undefined) {
      try {
        text = await fs.promises.readFile(uri.fsPath, 'utf8');
      } catch {
        return [];
      }
    }

    const directives: ImportDirective[] = [];
    const lines = text.split('\n');
    const importRegex =
      /^\s*(import|export)\s+(?:(?:(?:\*|[\w\s{},$]+)\s+from\s+)?['"]([^'"]+)['"]|['"]([^'"]+)['"])\s*;/;

    const currentDir = path.dirname(uri.fsPath);

    for (let i = 0; i < lines.length; i++) {
      const match = importRegex.exec(lines[i]);
      if (match) {
        const isExport = match[1] === 'export';
        const rawUri = match[2] || match[3];
        if (!rawUri) {
          continue;
        }

        let resolvedPath: string | undefined;
        if (rawUri.startsWith('./') || rawUri.startsWith('../')) {
          resolvedPath = this.resolveRelativeImport(currentDir, rawUri);
        }

        directives.push({
          uri: rawUri,
          resolvedPath,
          isExport,
          line: i,
        });
      }
    }

    return directives;
  }

  public async getDependencyEdges(uri: vscode.Uri, content?: string): Promise<DependencyEdge[]> {
    const directives = await this.extractImports(uri, content);
    const fromFile = uri.fsPath.replace(/\\/g, '/');
    const edges: DependencyEdge[] = [];

    for (const d of directives) {
      if (d.resolvedPath) {
        edges.push({
          fromFile,
          toFile: d.resolvedPath,
          type: d.isExport ? 'export' : 'import',
        });
      }
    }

    return edges;
  }

  public async warmup(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<void> {
    if (token?.isCancellationRequested) {
      return;
    }

    try {
      await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri);
      if (token?.isCancellationRequested) {
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.executeDefinitionProvider',
        uri,
        new vscode.Position(0, 0)
      );
    } catch (err) {
      logger.debug(`TypeScript warmup error for ${uri.fsPath}`, { error: String(err) });
    }
  }

  private parseTypeScriptSymbols(content: string, fileId: string): SymbolRecord[] {
    const records: SymbolRecord[] = [];
    const lines = content.split('\n');

    let currentContainer: { name: string; kind: string; depth: number } | null = null;
    let bracketDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.replace(/\/\/.*$/, ''); // strip comments

      // 1. Class: export? abstract? class Name
      const classMatch =
        /(?:^|\s)(?:export\s+|default\s+|abstract\s+)*class\s+([A-Za-z0-9_$]+)/.exec(line);
      if (classMatch) {
        const name = classMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'class',
            line: i,
            column: col >= 0 ? col : 0,
            adapterId: this.id,
          })
        );
        currentContainer = { name, kind: 'class', depth: bracketDepth };
      }

      // 2. Interface: export? interface Name
      const interfaceMatch = /(?:^|\s)(?:export\s+)*interface\s+([A-Za-z0-9_$]+)/.exec(line);
      if (interfaceMatch) {
        const name = interfaceMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'interface',
            line: i,
            column: col >= 0 ? col : 0,
            adapterId: this.id,
          })
        );
        currentContainer = { name, kind: 'interface', depth: bracketDepth };
      }

      // 3. Type alias: export? type Name =
      const typeMatch = /(?:^|\s)(?:export\s+)*type\s+([A-Za-z0-9_$]+)\s*(?:<[^>]+>)?\s*=/.exec(
        line
      );
      if (typeMatch) {
        const name = typeMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'type',
            line: i,
            column: col >= 0 ? col : 0,
            adapterId: this.id,
          })
        );
      }

      // 4. Function: export? async? function name(...)
      const fnMatch = /(?:^|\s)(?:export\s+|default\s+|async\s+)*function\s+([A-Za-z0-9_$]+)/.exec(
        line
      );
      if (fnMatch) {
        const name = fnMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'function',
            line: i,
            column: col >= 0 ? col : 0,
            adapterId: this.id,
          })
        );
      }

      // 5. Arrow functions & Variables: export? const/let/var name = (...) => ...
      const varFnMatch =
        /(?:^|\s)(?:export\s+)*(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/.exec(
          line
        );
      if (varFnMatch) {
        const name = varFnMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'function',
            line: i,
            column: col >= 0 ? col : 0,
            adapterId: this.id,
          })
        );
      } else {
        // Plain variables: export? const/let/var name = ...
        const varMatch =
          /(?:^|\s)(?:export\s+)*(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+)?\s*(?:=|;)/.exec(
            line
          );
        if (varMatch) {
          const name = varMatch[1];
          if (!classMatch && !interfaceMatch && !typeMatch && !fnMatch) {
            const col = rawLine.indexOf(name);
            records.push(
              createSymbolRecord({
                fileId,
                name,
                kind: 'variable',
                line: i,
                column: col >= 0 ? col : 0,
                adapterId: this.id,
              })
            );
          }
        }
      }

      // 6. Methods inside class or interface
      if (
        currentContainer &&
        !classMatch &&
        !interfaceMatch &&
        !typeMatch &&
        !fnMatch &&
        !varFnMatch
      ) {
        const methodMatch =
          /^\s*(?:(?:public|private|protected|static|readonly|async|override)\s+)*([A-Za-z0-9_$]+)\s*(?:<[^>]+>)?\s*\([^;{]*\)\s*(?::\s*[^{;]+)?(?:\s*\{|;)/.exec(
            line
          );
        if (methodMatch) {
          const name = methodMatch[1];
          if (!/^(if|for|while|switch|catch|constructor)$/.test(name)) {
            const col = rawLine.indexOf(name);
            records.push(
              createSymbolRecord({
                fileId,
                name,
                kind: 'method',
                line: i,
                column: col >= 0 ? col : 0,
                containerName: currentContainer.name,
                adapterId: this.id,
              })
            );
          } else if (name === 'constructor') {
            const col = rawLine.indexOf(name);
            records.push(
              createSymbolRecord({
                fileId,
                name,
                kind: 'constructor',
                line: i,
                column: col >= 0 ? col : 0,
                containerName: currentContainer.name,
                adapterId: this.id,
              })
            );
          }
        }
      }

      // Track bracket depth
      for (const char of line) {
        if (char === '{') {
          bracketDepth++;
        } else if (char === '}') {
          bracketDepth = Math.max(0, bracketDepth - 1);
          if (currentContainer && bracketDepth <= currentContainer.depth) {
            currentContainer = null;
          }
        }
      }
    }

    return records;
  }

  private resolveRelativeImport(dir: string, relPath: string): string | undefined {
    const basePath = path.resolve(dir, relPath);

    // Try direct file extensions
    const candidates = [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.jsx`,
      `${basePath}.d.ts`,
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx'),
      path.join(basePath, 'index.js'),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand) && !fs.statSync(cand).isDirectory()) {
        return cand.replace(/\\/g, '/');
      }
    }

    // Default to .ts if not found on disk yet
    return `${basePath}.ts`.replace(/\\/g, '/');
  }
}
