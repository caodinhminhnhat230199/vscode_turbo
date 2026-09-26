import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import { DartLanguageAdapter } from '../../../../src/index/adapters/DartLanguageAdapter';
import { configService } from '../../../../src/vscode/config';

describe('DartLanguageAdapter', () => {
  let adapter: DartLanguageAdapter;

  beforeEach(() => {
    adapter = new DartLanguageAdapter();
  });

  describe('P8.2: Detection & File Rules', () => {
    it('handles .dart files and dart languageId', () => {
      expect(adapter.canHandle(vscode.Uri.file('/app/lib/main.dart'), 'dart')).toBe(true);
      expect(adapter.canHandle(vscode.Uri.file('/app/lib/main.dart'))).toBe(true);
      expect(adapter.canHandle(vscode.Uri.file('/app/index.ts'))).toBe(false);
    });

    it('excludes build and .dart_tool directories', () => {
      expect(adapter.canHandle(vscode.Uri.file('/app/build/app.dart'))).toBe(false);
      expect(adapter.canHandle(vscode.Uri.file('/app/.dart_tool/package_config.dart'))).toBe(false);
    });

    it('honors generated file configuration toggle', () => {
      // By default indexGeneratedFiles is false
      expect(configService.getConfig().indexGeneratedFiles).toBe(false);
      expect(adapter.canHandle(vscode.Uri.file('/app/lib/model.g.dart'))).toBe(false);
      expect(adapter.canHandle(vscode.Uri.file('/app/lib/state.freezed.dart'))).toBe(false);
      expect(adapter.canHandle(vscode.Uri.file('/app/lib/api.chopper.dart'))).toBe(false);
      expect(adapter.canHandle(vscode.Uri.file('/app/lib/service.mocks.dart'))).toBe(false);

      // Normal file is handled
      expect(adapter.canHandle(vscode.Uri.file('/app/lib/user.dart'))).toBe(true);
    });
  });

  describe('P8.2: Symbol Support', () => {
    it('extracts class, mixin, enum, extension, function, method, getter, setter, field', async () => {
      const dartSource = `
import 'package:flutter/material.dart';

// Top-level function
void main() {
  runApp(const MyApp());
}

// Class with constructor, fields, methods, getter, setter
class MyApp extends StatelessWidget {
  final String title = 'Test';
  static const int version = 1;

  const MyApp({super.key});

  String get appTitle => title;
  set appTitle(String val) {}

  @override
  Widget build(BuildContext context) {
    return Container();
  }
}

// Mixin
mixin LoggerMixin {
  void log(String msg) {}
}

// Enum
enum Status {
  active,
  inactive
}

// Extension
extension StringExt on String {
  bool get isValid => length > 0;
}
`;

      const uri = vscode.Uri.file('/workspace/lib/sample.dart');
      const symbols = await adapter.extractSymbols(uri, 'file-1', dartSource);

      const symbolMap = new Map(symbols.map((s) => [s.name, s]));

      // Class
      expect(symbolMap.has('MyApp')).toBe(true);
      expect(symbolMap.get('MyApp')?.kind).toBe('class');

      // Top-level function
      expect(symbolMap.has('main')).toBe(true);
      expect(symbolMap.get('main')?.kind).toBe('function');
      expect(symbolMap.get('main')?.containerName).toBeUndefined();

      // Fields
      expect(symbolMap.has('title')).toBe(true);
      expect(symbolMap.get('title')?.kind).toBe('field');
      expect(symbolMap.get('title')?.containerName).toBe('MyApp');

      // Constructor & Methods
      expect(symbolMap.has('build')).toBe(true);
      expect(symbolMap.get('build')?.kind).toBe('method');
      expect(symbolMap.get('build')?.containerName).toBe('MyApp');

      // Getter & Setter
      expect(symbolMap.has('appTitle')).toBe(true);
      const appTitleSymbols = symbols.filter((s) => s.name === 'appTitle');
      expect(appTitleSymbols.length).toBeGreaterThanOrEqual(1);
      expect(appTitleSymbols.some((s) => s.kind === 'getter')).toBe(true);

      // Mixin
      expect(symbolMap.has('LoggerMixin')).toBe(true);
      expect(symbolMap.get('LoggerMixin')?.kind).toBe('mixin');

      // Enum
      expect(symbolMap.has('Status')).toBe(true);
      expect(symbolMap.get('Status')?.kind).toBe('enum');

      // Extension
      expect(symbolMap.has('StringExt')).toBe(true);
      expect(symbolMap.get('StringExt')?.kind).toBe('extension');
    });
  });

  describe('P8.3: Dart Import Extraction & Dependency Edges', () => {
    it('extracts imports and exports and resolves relative paths', async () => {
      const dartSource = `
import 'dart:async';
import 'package:flutter/material.dart';
import './widgets/custom_button.dart';
import '../models/user.dart';
export './widgets/custom_button.dart';
`;
      const uri = vscode.Uri.file('/workspace/lib/screens/home.dart');
      const imports = await adapter.extractImports(uri, dartSource);

      expect(imports).toHaveLength(5);
      expect(imports[0].uri).toBe('dart:async');
      expect(imports[1].uri).toBe('package:flutter/material.dart');

      // Relative imports resolved
      const buttonImport = imports.find(
        (i) => i.uri === './widgets/custom_button.dart' && !i.isExport
      );
      expect(buttonImport).toBeDefined();
      expect(buttonImport?.resolvedPath).toBe(
        path.resolve('/workspace/lib/screens', './widgets/custom_button.dart').replace(/\\/g, '/')
      );

      const userImport = imports.find((i) => i.uri === '../models/user.dart');
      expect(userImport?.resolvedPath).toBe(
        path.resolve('/workspace/lib/screens', '../models/user.dart').replace(/\\/g, '/')
      );

      // Export directive
      const buttonExport = imports.find((i) => i.isExport);
      expect(buttonExport).toBeDefined();
      expect(buttonExport?.uri).toBe('./widgets/custom_button.dart');
    });

    it('creates dependency edges for resolvable imports and exports', async () => {
      const dartSource = `
import './helper.dart';
export './helper.dart';
`;
      const uri = vscode.Uri.file('/workspace/lib/main.dart');
      const edges = await adapter.getDependencyEdges(uri, dartSource);

      expect(edges).toHaveLength(2);
      expect(edges[0].type).toBe('import');
      expect(edges[0].toFile).toBe(
        path.resolve('/workspace/lib', './helper.dart').replace(/\\/g, '/')
      );
      expect(edges[1].type).toBe('export');
    });
  });

  describe('P8.4: Dart Warmup Candidates', () => {
    it('prioritizes main.dart when present in workspace root', async () => {
      const workspaceRoot = path.resolve('test/fixtures/sample-flutter');
      const candidates = await adapter.getWarmupCandidates(workspaceRoot);

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const mainPath = path.join(workspaceRoot, 'lib', 'main.dart').replace(/\\/g, '/');
      expect(candidates).toContain(mainPath);
    });
  });
});
