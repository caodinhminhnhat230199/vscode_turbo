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
import { configService } from '../../vscode/config';
import { logger } from '../../core/logging/Logger';

export class DartLanguageAdapter implements LanguageAdapter {
  public readonly id = 'dart-adapter';
  public readonly supportedLanguages = ['dart'];
  public readonly capabilities: AdapterCapabilities = {
    supportsSymbols: true,
    supportsWarmup: true,
    supportsImports: true,
    supportsReferences: true,
    supportsDependencyGraph: true,
    supportsDocumentSymbols: true,
    supportsFastFallback: true,
  };

  private pubspecCache = new Map<string, { packageName: string; rootDir: string }>();

  public canHandle(uri: vscode.Uri, languageId?: string): boolean {
    const filePath = uri.fsPath.replace(/\\/g, '/');

    // 1. Language or extension check
    const isDart = languageId === 'dart' || filePath.endsWith('.dart');
    if (!isDart) {
      return false;
    }

    // 2. File rules: exclude build and .dart_tool
    if (/\/(build|\.dart_tool)(\/|$)/.test(filePath)) {
      return false;
    }

    // 3. Generated file toggle
    const config = configService.getConfig();
    if (!config.indexGeneratedFiles) {
      if (
        /\.(g|freezed|mocks|config|chopper|gr)\.dart$/i.test(filePath) ||
        /\.generated\.dart$/i.test(filePath)
      ) {
        return false;
      }
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
        logger.debug(`Failed to read Dart file: ${uri.fsPath}`, { error: String(err) });
        return [];
      }
    }

    return this.parseDartSymbols(text, fileId);
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
      /^\s*(import|export|part)\s+['"]([^'"]+)['"](?:\s+as\s+[A-Za-z0-9_$]+)?(?:\s+(?:show|hide)\s+[^;]+)?\s*;/;

    const pkgInfo = await this.findPubspecInfo(uri.fsPath);

    for (let i = 0; i < lines.length; i++) {
      const match = importRegex.exec(lines[i]);
      if (match) {
        const type = match[1];
        const rawUri = match[2];
        const isExport = type === 'export';
        let resolvedPath: string | undefined;

        if (rawUri.startsWith('package:') && pkgInfo) {
          const prefix = `package:${pkgInfo.packageName}/`;
          if (rawUri.startsWith(prefix)) {
            const rel = rawUri.slice(prefix.length);
            resolvedPath = path.join(pkgInfo.rootDir, 'lib', rel).replace(/\\/g, '/');
          }
        } else if (rawUri.startsWith('./') || rawUri.startsWith('../')) {
          resolvedPath = path.resolve(path.dirname(uri.fsPath), rawUri).replace(/\\/g, '/');
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
      logger.debug(`Dart warmup error for ${uri.fsPath}`, { error: String(err) });
    }
  }

  public async getWarmupCandidates(workspaceRoot: string): Promise<string[]> {
    const candidates: string[] = [];
    const seen = new Set<string>();

    const addCandidate = (fp: string) => {
      const normalized = fp.replace(/\\/g, '/');
      if (!seen.has(normalized) && fs.existsSync(normalized)) {
        seen.add(normalized);
        candidates.push(normalized);
      }
    };

    // 1. Active Dart file
    const activeEditor = vscode.window.activeTextEditor;
    let activePath: string | undefined;
    if (activeEditor && this.canHandle(activeEditor.document.uri)) {
      activePath = activeEditor.document.uri.fsPath;
      addCandidate(activePath);
    }

    // 2. main.dart (lib/main.dart or bin/main.dart)
    const mainDartLib = path.join(workspaceRoot, 'lib', 'main.dart');
    const mainDartBin = path.join(workspaceRoot, 'bin', 'main.dart');
    if (fs.existsSync(mainDartLib)) {
      addCandidate(mainDartLib);
    } else if (fs.existsSync(mainDartBin)) {
      addCandidate(mainDartBin);
    }

    // 3. Neighbor imports of active or main file
    const baseFiles: string[] = [];
    if (activePath && fs.existsSync(activePath)) {
      baseFiles.push(activePath);
    }
    if (fs.existsSync(mainDartLib)) {
      baseFiles.push(mainDartLib);
    }

    for (const base of baseFiles) {
      try {
        const imports = await this.extractImports(vscode.Uri.file(base));
        for (const imp of imports) {
          if (imp.resolvedPath) {
            addCandidate(imp.resolvedPath);
          }
        }
      } catch {
        // ignore
      }
    }

    return candidates;
  }

  private parseDartSymbols(content: string, fileId: string): SymbolRecord[] {
    const records: SymbolRecord[] = [];
    const lines = content.split('\n');

    let currentContainer: { name: string; kind: string; depth: number } | null = null;
    let bracketDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.replace(/\/\/.*$/, ''); // strip comments

      // 1. Container declarations: class, mixin, enum, extension
      const classMatch =
        /(?:^|\s)(?:abstract\s+|sealed\s+|base\s+|interface\s+|final\s+)*class\s+([A-Za-z0-9_$]+)/.exec(
          line
        );
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

      const mixinMatch = /(?:^|\s)mixin\s+([A-Za-z0-9_$]+)/.exec(line);
      if (mixinMatch) {
        const name = mixinMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'mixin',
            line: i,
            column: col >= 0 ? col : 0,
            adapterId: this.id,
          })
        );
        currentContainer = { name, kind: 'mixin', depth: bracketDepth };
      }

      const enumMatch = /(?:^|\s)enum\s+([A-Za-z0-9_$]+)/.exec(line);
      if (enumMatch) {
        const name = enumMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'enum',
            line: i,
            column: col >= 0 ? col : 0,
            adapterId: this.id,
          })
        );
        currentContainer = { name, kind: 'enum', depth: bracketDepth };
      }

      const extMatch = /(?:^|\s)extension\s+([A-Za-z0-9_$]+)?\s+on\b/.exec(line);
      if (extMatch && extMatch[1]) {
        const name = extMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'extension',
            line: i,
            column: col >= 0 ? col : 0,
            adapterId: this.id,
          })
        );
        currentContainer = { name, kind: 'extension', depth: bracketDepth };
      }

      // 2. Getter / Setter
      const getterMatch = /(?:^|\s)get\s+([A-Za-z0-9_$]+)\s*(?:=>|\{)/.exec(line);
      if (getterMatch) {
        const name = getterMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'getter',
            line: i,
            column: col >= 0 ? col : 0,
            containerName: currentContainer?.name,
            adapterId: this.id,
          })
        );
      }

      const setterMatch = /(?:^|\s)set\s+([A-Za-z0-9_$]+)\s*\(/.exec(line);
      if (setterMatch) {
        const name = setterMatch[1];
        const col = rawLine.indexOf(name);
        records.push(
          createSymbolRecord({
            fileId,
            name,
            kind: 'setter',
            line: i,
            column: col >= 0 ? col : 0,
            containerName: currentContainer?.name,
            adapterId: this.id,
          })
        );
      }

      // 3. Functions / Methods / Constructors
      if (!classMatch && !mixinMatch && !enumMatch && !extMatch && !getterMatch && !setterMatch) {
        // Method or function definition: Type name(...) { or =>
        const fnMatch =
          /(?:^|\s)(?:(?:void|[A-Za-z0-9_$<>,?]+)\s+)?([A-Za-z0-9_$]+)\s*\([^;{]*\)\s*(?:async\s*)?(?:=>|\{)/.exec(
            line
          );
        if (fnMatch) {
          const name = fnMatch[1];
          // Skip keywords like if, for, while, switch, catch
          if (!/^(if|for|while|switch|catch)$/.test(name)) {
            const col = rawLine.indexOf(name);
            const isInside = Boolean(currentContainer);
            const isConstructor = isInside && name === currentContainer?.name;
            const kind = isConstructor ? 'constructor' : isInside ? 'method' : 'function';

            records.push(
              createSymbolRecord({
                fileId,
                name,
                kind,
                line: i,
                column: col >= 0 ? col : 0,
                containerName: currentContainer?.name,
                adapterId: this.id,
              })
            );
          }
        } else if (currentContainer && currentContainer.kind === 'class') {
          // 4. Class fields: final/const/var/type fieldName = ... or ;
          const fieldMatch =
            /(?:^|\s)(?:final|const|late|var|[A-Za-z0-9_$<>,?]+)\s+([A-Za-z0-9_$]+)\s*(?:=|;)/.exec(
              line
            );
          if (fieldMatch) {
            const name = fieldMatch[1];
            if (!/^(return|throw|import|export|class|mixin|enum)$/.test(name)) {
              const col = rawLine.indexOf(name);
              records.push(
                createSymbolRecord({
                  fileId,
                  name,
                  kind: 'field',
                  line: i,
                  column: col >= 0 ? col : 0,
                  containerName: currentContainer.name,
                  adapterId: this.id,
                })
              );
            }
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

  private async findPubspecInfo(
    fromFilePath: string
  ): Promise<{ packageName: string; rootDir: string } | null> {
    let dir = path.dirname(fromFilePath);
    const root = path.parse(dir).root;

    while (dir && dir !== root) {
      if (this.pubspecCache.has(dir)) {
        return this.pubspecCache.get(dir)!;
      }

      const pubspecPath = path.join(dir, 'pubspec.yaml');
      if (fs.existsSync(pubspecPath)) {
        try {
          const yamlContent = await fs.promises.readFile(pubspecPath, 'utf8');
          const nameMatch = /^name:\s*([A-Za-z0-9_]+)/m.exec(yamlContent);
          if (nameMatch) {
            const info = { packageName: nameMatch[1], rootDir: dir };
            this.pubspecCache.set(dir, info);
            return info;
          }
        } catch {
          // ignore
        }
      }
      dir = path.dirname(dir);
    }

    return null;
  }
}
