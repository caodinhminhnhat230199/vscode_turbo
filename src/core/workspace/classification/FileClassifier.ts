import * as path from 'path';

export interface FileClassification {
  source: boolean;
  generated: boolean;
  buildArtifact: boolean;
  dependency: boolean;
  reason: string;
}

const SOURCE_EXTENSIONS = new Set([
  '.dart',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.java',
  '.kt',
  '.py',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.rb',
  '.php',
  '.scala',
  '.vue',
  '.svelte',
]);

const DEPENDENCY_DIR_PATTERNS = [
  /\/node_modules(\/|$)/,
  /\/\.pub-cache(\/|$)/,
  /\/pods(\/|$)/,
  /\/vendor(\/|$)/,
  /\/\.gradle\/caches(\/|$)/,
];

const BUILD_ARTIFACT_DIR_PATTERNS = [
  /\/build(\/|$)/,
  /\/dist(\/|$)/,
  /\/out(\/|$)/,
  /\/target(\/|$)/,
  /\/\.dart_tool(\/|$)/,
  /\/\.next(\/|$)/,
  /\/\.nuxt(\/|$)/,
  /\/coverage(\/|$)/,
  /\/deriveddata(\/|$)/,
  /\/bin(\/|$)/,
  /\/obj(\/|$)/,
];

const GENERATED_FILE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Dart / Flutter generated files
  { pattern: /\.g\.dart$/, reason: 'Dart code generator output (*.g.dart)' },
  { pattern: /\.freezed\.dart$/, reason: 'Freezed code generator output (*.freezed.dart)' },
  { pattern: /\.mocks\.dart$/, reason: 'Mockito code generator output (*.mocks.dart)' },
  { pattern: /\.config\.dart$/, reason: 'Injectable code generator output (*.config.dart)' },
  { pattern: /\.chopper\.dart$/, reason: 'Chopper code generator output (*.chopper.dart)' },
  { pattern: /\.gr\.dart$/, reason: 'AutoRoute code generator output (*.gr.dart)' },
  // Node / TS / Generic generated files
  {
    pattern: /\.generated\.(ts|js|tsx|jsx|dart)$/,
    reason: 'Generated source file (*.generated.*)',
  },
  { pattern: /\.gen\.(ts|js|tsx|jsx|dart)$/, reason: 'Generated source file (*.gen.*)' },
  { pattern: /routeTree\.gen\.ts$/, reason: 'TanStack Router generated route tree' },
  { pattern: /\.pb\.(go|dart|cc|h)$/, reason: 'Protocol buffer generated file (*.pb.*)' },
];

export class FileClassifier {
  public classify(filePath: string): FileClassification {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    const basename = path.basename(normalized);
    const ext = path.extname(normalized);

    // 1. Check dependency paths
    for (const depPattern of DEPENDENCY_DIR_PATTERNS) {
      if (depPattern.test(normalized)) {
        return {
          source: false,
          generated: false,
          buildArtifact: false,
          dependency: true,
          reason: `Inside dependency directory (${depPattern.source})`,
        };
      }
    }

    // 2. Check build artifact directories
    for (const buildPattern of BUILD_ARTIFACT_DIR_PATTERNS) {
      if (buildPattern.test(normalized)) {
        return {
          source: false,
          generated: true,
          buildArtifact: true,
          dependency: false,
          reason: `Inside build artifact directory (${buildPattern.source})`,
        };
      }
    }

    // 3. Check build artifact file extensions (sourcemaps, minified bundles)
    if (
      normalized.endsWith('.map') ||
      normalized.endsWith('.min.js') ||
      normalized.endsWith('.min.css')
    ) {
      return {
        source: false,
        generated: true,
        buildArtifact: true,
        dependency: false,
        reason: 'Minified or sourcemap build artifact',
      };
    }

    // 4. Check generated source code patterns
    for (const { pattern, reason } of GENERATED_FILE_PATTERNS) {
      if (pattern.test(basename)) {
        return {
          source: true,
          generated: true,
          buildArtifact: false,
          dependency: false,
          reason,
        };
      }
    }

    // 5. Normal source file
    if (SOURCE_EXTENSIONS.has(ext)) {
      return {
        source: true,
        generated: false,
        buildArtifact: false,
        dependency: false,
        reason: `Recognized source code extension (${ext})`,
      };
    }

    // 6. Generic resource or configuration file
    return {
      source: false,
      generated: false,
      buildArtifact: false,
      dependency: false,
      reason: `Non-source resource or configuration file (${ext || 'no extension'})`,
    };
  }
}

export const fileClassifier = new FileClassifier();
export function classifyFile(filePath: string): FileClassification {
  return fileClassifier.classify(filePath);
}
