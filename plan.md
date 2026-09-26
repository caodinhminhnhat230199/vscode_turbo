# CodePulse — Implementation Plan

> VS Code extension for diagnosing and reducing latency in navigation/search workflows, warming up/indexing projects on startup, and providing a management/settings dashboard.

---

## 0. Document Purpose

This document defines the implementation roadmap for CodePulse.

It is written so that another coding agent can implement the extension phase-by-phase without needing architectural clarification.

The implementation MUST prioritize:

1. Extension stability.
2. Low extension-host overhead.
3. Measurable performance improvements.
4. Evidence-based diagnostics.
5. Safe, user-approved optimizations.
6. Incremental indexing instead of full-project rescans.
7. Language-agnostic architecture.
8. Flutter/Dart as the first vertical slice.
9. No hidden workspace mutations.
10. No background behavior that noticeably degrades typing, navigation, or editing responsiveness.

---

# 1. Product Goals

CodePulse should help answer:

- Why is `Go to Definition` slow?
- Why is `Find References` slow?
- Why is workspace-wide search slow?
- Why does F12 feel fast only after the project has been open for a while?
- Is the bottleneck VS Code, the Extension Host, filesystem scanning, a Language Server, or workspace structure?
- Can generated folders or excessive watchers be excluded safely?
- Can we warm up/index the project at startup so common navigation is faster?
- Can we provide a fast local symbol/file index as a fallback or accelerator?
- Can we quantify performance before and after optimization?

---

# 2. Non-Goals

The first versions MUST NOT attempt to:

- Replace VS Code internals.
- Replace the Dart Analysis Server.
- Replace TypeScript Server.
- Modify other extensions silently.
- Disable other extensions automatically.
- Monkey-patch VS Code internals.
- Depend on undocumented internal APIs for core functionality.
- Parse every programming language semantically.
- Build a full IntelliJ-equivalent PSI/UAST system in V1.
- Intercept every native navigation request globally.
- Rebuild the full project index after every file change.
- Run high-concurrency background parsing while the user is actively editing.

---

# 3. High-Level Architecture

```text
User
 │
 ▼
CodePulse UI
 │
 ├───────────────────────┐
 ▼                       ▼
Diagnostics Engine       Settings / Commands
 │
 ├───────────────┐
 ▼               ▼
Benchmark Engine Optimization Engine
 │               │
 └───────┬───────┘
         ▼
      Evidence
         │
         ▼
   Recommendation

Workspace Events
 │
 ▼
Warmup Engine
 │
 ▼
Priority Scheduler
 │
 ├──────────────┬──────────────┐
 ▼              ▼              ▼
Language Warmup File Indexing  Symbol Indexing
 │              │              │
 └──────────────┴──────┬───────┘
                       ▼
                  Index Storage
                       │
                 ┌─────┴─────┐
                 ▼           ▼
              Search      Navigation
              Engine        Engine
```

---

# 4. Core Design Principles

## 4.1 Evidence Before Recommendation

Every optimization recommendation MUST include evidence.

Bad:

```text
Dart may be slow.
```

Good:

```text
Go to Definition cold P50: 2.8s
Go to Definition warm P50: 86ms
5/5 cold requests > 2s
Likely cause: language-server cold initialization
Confidence: HIGH
```

---

## 4.2 User Approval Before Workspace Mutation

Any recommendation that changes:

- `.vscode/settings.json`
- workspace settings
- watcher excludes
- search excludes
- CodePulse settings

MUST show:

- what will change;
- old value;
- new value;
- impact;
- rollback option.

No silent writes.

---

## 4.3 Incremental First

Never rebuild the full index unless one of these is true:

- user explicitly requests rebuild;
- index schema changed;
- index corruption detected;
- workspace fingerprint is invalid;
- project root changed substantially.

Normal file changes MUST re-index only impacted files.

---

## 4.4 User Activity Wins

Priority order:

```text
P0 — direct user action
P1 — active editor / current navigation
P2 — language-server readiness
P3 — git-changed / recently used files
P4 — dependency-neighborhood warmup
P5 — background indexing
```

Background work MUST yield when:

- typing detected;
- editor interaction is frequent;
- navigation request is in progress;
- extension host appears saturated;
- CPU budget is exceeded.

---

## 4.5 Language-Agnostic Core

Core modules MUST NOT import Dart-specific logic.

Language specifics belong under adapters.

```text
core/
indexer/
warmup/
diagnostics/
navigation/
search/

adapters/
  generic/
  dart/
  typescript/
```

---

# 5. Proposed Repository Structure

```text
codepulse/
├─ package.json
├─ tsconfig.json
├─ esbuild.js
├─ src/
│  ├─ extension.ts
│  │
│  ├─ core/
│  │  ├─ workspace/
│  │  │  ├─ WorkspaceDetector.ts
│  │  │  ├─ WorkspaceFingerprint.ts
│  │  │  └─ WorkspaceState.ts
│  │  ├─ events/
│  │  │  ├─ EventBus.ts
│  │  │  └─ eventTypes.ts
│  │  ├─ logging/
│  │  │  ├─ Logger.ts
│  │  │  └─ LogLevel.ts
│  │  └─ utils/
│  │
│  ├─ diagnostics/
│  │  ├─ DiagnosticEngine.ts
│  │  ├─ DiagnosticContext.ts
│  │  ├─ model/
│  │  │  ├─ Finding.ts
│  │  │  ├─ Evidence.ts
│  │  │  └─ Recommendation.ts
│  │  ├─ providers/
│  │  │  ├─ WorkspaceDiagnostic.ts
│  │  │  ├─ SearchDiagnostic.ts
│  │  │  ├─ DefinitionDiagnostic.ts
│  │  │  ├─ ReferenceDiagnostic.ts
│  │  │  ├─ LanguageDiagnostic.ts
│  │  │  └─ ExtensionDiagnostic.ts
│  │  └─ rules/
│  │     ├─ watcherRules.ts
│  │     ├─ searchRules.ts
│  │     ├─ workspaceRules.ts
│  │     └─ languageRules.ts
│  │
│  ├─ benchmark/
│  │  ├─ BenchmarkEngine.ts
│  │  ├─ BenchmarkRunner.ts
│  │  ├─ Percentile.ts
│  │  └─ benchmarkTypes.ts
│  │
│  ├─ indexer/
│  │  ├─ IndexEngine.ts
│  │  ├─ IndexScheduler.ts
│  │  ├─ IndexQueue.ts
│  │  ├─ PriorityCalculator.ts
│  │  ├─ FileFingerprint.ts
│  │  ├─ model/
│  │  │  ├─ FileRecord.ts
│  │  │  ├─ SymbolRecord.ts
│  │  │  └─ ReferenceRecord.ts
│  │  └─ storage/
│  │     ├─ IndexStore.ts
│  │     ├─ MemoryIndexStore.ts
│  │     └─ SqliteIndexStore.ts
│  │
│  ├─ warmup/
│  │  ├─ WarmupEngine.ts
│  │  ├─ WarmupScheduler.ts
│  │  ├─ WarmupStrategy.ts
│  │  ├─ ActivityMonitor.ts
│  │  └─ strategies/
│  │     ├─ ActiveFileStrategy.ts
│  │     ├─ RecentFilesStrategy.ts
│  │     ├─ GitChangedStrategy.ts
│  │     └─ EntryPointStrategy.ts
│  │
│  ├─ adapters/
│  │  ├─ LanguageAdapter.ts
│  │  ├─ AdapterRegistry.ts
│  │  ├─ generic/
│  │  │  └─ GenericLanguageAdapter.ts
│  │  ├─ dart/
│  │  │  ├─ DartLanguageAdapter.ts
│  │  │  ├─ DartProjectDetector.ts
│  │  │  └─ DartExcludes.ts
│  │  └─ typescript/
│  │     └─ TypeScriptLanguageAdapter.ts
│  │
│  ├─ search/
│  │  ├─ SearchEngine.ts
│  │  ├─ FileSearchEngine.ts
│  │  ├─ SymbolSearchEngine.ts
│  │  ├─ RipgrepEngine.ts
│  │  └─ SearchResultMerger.ts
│  │
│  ├─ navigation/
│  │  ├─ DefinitionEngine.ts
│  │  ├─ ReferenceEngine.ts
│  │  ├─ NavigationMode.ts
│  │  └─ HybridNavigationEngine.ts
│  │
│  ├─ optimizer/
│  │  ├─ OptimizationEngine.ts
│  │  ├─ SettingsDiff.ts
│  │  ├─ ApplyRecommendation.ts
│  │  └─ rules/
│  │
│  ├─ vscode/
│  │  ├─ commands.ts
│  │  ├─ config.ts
│  │  ├─ contexts.ts
│  │  └─ statusBar.ts
│  │
│  └─ webview/
│     ├─ DashboardProvider.ts
│     ├─ WebviewMessageRouter.ts
│     └─ WebviewProtocol.ts
│
├─ webview-ui/
│  ├─ src/
│  │  ├─ pages/
│  │  │  ├─ OverviewPage.tsx
│  │  │  ├─ DiagnosticsPage.tsx
│  │  │  ├─ IndexPage.tsx
│  │  │  ├─ WarmupPage.tsx
│  │  │  ├─ RecommendationsPage.tsx
│  │  │  └─ SettingsPage.tsx
│  │  ├─ components/
│  │  ├─ store/
│  │  └─ api/
│  └─ vite.config.ts
│
├─ test/
│  ├─ unit/
│  ├─ integration/
│  ├─ fixtures/
│  └─ vscode/
│
└─ docs/
```

---

# 6. Shared Domain Models

## 6.1 PerformanceFinding

```ts
export interface PerformanceFinding {
  id: string;
  category:
    | 'workspace'
    | 'filesystem'
    | 'search'
    | 'languageServer'
    | 'extension'
    | 'index'
    | 'navigation';

  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high';

  title: string;
  summary: string;

  evidence: Evidence[];
  recommendation?: Recommendation;

  createdAt: number;
}
```

---

## 6.2 Evidence

```ts
export interface Evidence {
  label: string;
  value: string | number;
  unit?: string;
  source: string;
}
```

---

## 6.3 Recommendation

```ts
export interface Recommendation {
  id: string;
  type:
    | 'workspaceSetting'
    | 'codePulseSetting'
    | 'manualAction'
    | 'reindex'
    | 'restartLanguageServer';

  title: string;
  description: string;

  safeToAutoApply: boolean;
  requiresReload: boolean;

  changes?: SettingChange[];
}
```

---

## 6.4 BenchmarkResult

```ts
export interface BenchmarkResult {
  operation:
    | 'definition'
    | 'references'
    | 'workspaceSymbols'
    | 'fileSearch'
    | 'textSearch';

  sampleCount: number;

  minMs: number;
  maxMs: number;

  p50Ms: number;
  p75Ms: number;
  p90Ms: number;
  p95Ms: number;

  cold?: boolean;

  timestamp: number;
}
```

---

# 7. Phase 0 — Project Foundation

## Objective

Create a stable VS Code extension foundation before implementing diagnostics.

## Deliverables

- TypeScript extension.
- Bundling.
- Test setup.
- Logging.
- command registration.
- Activity Bar container.
- Webview dashboard shell.
- config access layer.
- extension storage abstraction.
- CI lint/test/build.

## Required Decisions

- Node target compatible with current VS Code extension host.
- Webview: React + Vite.
- Extension bundling: esbuild.
- Index storage abstraction created now, implementation can initially be memory-based.
- No heavy work in `activate()`.

## Activation Target

Extension activation should do only:

1. initialize logger;
2. initialize lightweight configuration;
3. register commands;
4. register views;
5. defer workspace scan.

Target:

```text
activation < 50ms under normal conditions
```

## Definition of Done

- Extension installs locally via VSIX.
- Dashboard opens.
- Commands visible.
- no heavy workspace scanning occurs during synchronous activation.
- unit tests run in CI.
- logging works through Output Channel.
- extension can persist small metadata through `globalState/workspaceState`.

---

# 8. Phase 1 — Workspace Diagnostics MVP

## Objective

Detect structural causes of slow VS Code behavior.

## Features

### 8.1 Workspace Scanner

Collect:

- workspace folders;
- total file count;
- source file count;
- generated file count;
- directory count;
- approximate project size;
- largest files;
- deepest directories;
- extension distribution;
- language distribution.

Use bounded traversal and exclusions.

Do not parse file contents in this phase.

---

### 8.2 Ignore/Exclude Detection

Inspect effective workspace settings for:

```text
files.exclude
files.watcherExclude
search.exclude
```

Detect common heavy directories that exist but are not excluded:

```text
.git
node_modules
build
dist
coverage
.dart_tool
.next
.nuxt
.gradle
target
Pods
DerivedData
vendor
```

Rules MUST account for project type.

---

### 8.3 Basic Language Detection

Detect language/project types using lightweight signals:

Flutter/Dart:

```text
pubspec.yaml
analysis_options.yaml
lib/
```

TypeScript/JavaScript:

```text
package.json
tsconfig.json
jsconfig.json
```

Java:

```text
pom.xml
build.gradle
settings.gradle
```

Python:

```text
pyproject.toml
requirements.txt
```

---

### 8.4 Diagnostics Report

Dashboard must display:

- project summary;
- detected languages;
- suspicious folders;
- search/watcher recommendations;
- estimated impact;
- severity/confidence;
- evidence.

---

### 8.5 Recommendation Preview

Implement settings diff generation.

Example:

```text
files.watcherExclude

Before:
{
  "**/.git/**": true
}

After:
{
  "**/.git/**": true,
  "**/build/**": true,
  "**/.dart_tool/**": true
}
```

User must press Apply.

---

## Phase 1 Definition of Done

- can scan a large Flutter project safely;
- can detect common generated/build folders;
- can show current exclude configuration;
- recommendations are evidence-based;
- applying recommendation updates workspace settings safely;
- rollback information is recorded for the current session.

---

# 9. Phase 2 — Benchmark & Performance Diagnostics

## Objective

Measure actual latency instead of inferring everything from project structure.

## Features

### 9.1 Benchmark Engine

Implement generic timed operation wrapper.

Support:

- warmup iterations;
- sample iterations;
- timeout;
- cancellation;
- percentile metrics;
- cold/warm labeling.

---

### 9.2 Definition Benchmark

Use VS Code command API:

```text
vscode.executeDefinitionProvider
```

Collect:

- duration;
- result count;
- timeout count;
- cold vs warm.

---

### 9.3 References Benchmark

Use:

```text
vscode.executeReferenceProvider
```

Collect same metrics.

---

### 9.4 Workspace Symbol Benchmark

Use:

```text
vscode.executeWorkspaceSymbolProvider
```

---

### 9.5 Search Benchmark

Measure:

- file search;
- text search where available;
- symbol search.

The benchmark must not intentionally load the entire project if user is active.

---

### 9.6 Cold vs Warm Classification

Example rule:

```text
coldP50 > 2000ms
warmP50 < 300ms
=> probable cold-start/indexing issue
```

Thresholds must be configurable.

---

### 9.7 Bottleneck Classification

Initial heuristic categories:

- project structure;
- filesystem/search;
- language server cold start;
- consistently slow language provider;
- extension/provider overlap;
- CodePulse index unhealthy.

---

## Phase 2 Definition of Done

- user can run a benchmark manually;
- benchmark can be cancelled;
- P50/P75/P90/P95 displayed;
- cold/warm results are separated;
- diagnostics creates evidence-backed findings;
- no benchmark runs automatically without explicit setting.

---

# 10. Phase 3 — Persistent File + Symbol Index

## Objective

Create a local persistent index that can be restored instantly.

## Features

### 10.1 IndexStore Abstraction

Required methods:

```ts
interface IndexStore {
  initialize(): Promise<void>;
  close(): Promise<void>;

  upsertFile(file: FileRecord): Promise<void>;
  removeFile(path: string): Promise<void>;

  replaceSymbolsForFile(
    fileId: number,
    symbols: SymbolRecord[]
  ): Promise<void>;

  findFiles(query: string, limit: number): Promise<FileRecord[]>;
  findSymbols(query: string, limit: number): Promise<SymbolRecord[]>;

  getFileFingerprint(path: string): Promise<FileFingerprint | undefined>;

  clear(): Promise<void>;
}
```

---

### 10.2 Initial Storage

Phase may begin with:

```text
MemoryIndexStore
```

but must finish with persistent storage.

Preferred production target:

```text
SQLite/WASM
```

or another storage implementation that does not require fragile per-platform native binaries.

---

### 10.3 File Fingerprinting

Record:

- relative path;
- file size;
- mtime;
- language;
- generated flag;
- optional content hash.

Fast validation:

```text
same size + same mtime => assume unchanged
```

Hash only when needed.

---

### 10.4 Generic Symbol Extraction

First fallback:

```text
vscode.executeDocumentSymbolProvider
```

Do not require AST parsing in this phase.

---

### 10.5 Index Restore

Startup behavior:

```text
open workspace
→ load index metadata
→ validate changed files
→ restore usable index immediately
→ schedule changed/new files
```

---

### 10.6 Incremental File Watcher

Watch project changes.

Handle:

- create;
- change;
- delete;
- rename where derivable.

Do not create one watcher per directory.

---

## Phase 3 Definition of Done

- index persists across VS Code restart;
- unchanged projects do not fully re-index;
- changed files re-index incrementally;
- symbol search returns results from local index;
- clear/rebuild index commands work;
- index corruption fallback exists;
- index schema versioning exists.

---

# 11. Phase 4 — Warmup Engine

## Objective

Make common navigation faster after workspace open.

## Warmup Pipeline

```text
Workspace opened
↓
Detect project type
↓
Restore index
↓
Build priority queue
↓
Warm active file
↓
Warm entry points
↓
Warm git-changed files
↓
Warm recent files
↓
Warm dependency neighbors
↓
Background remaining files
```

---

## 11.1 Warmup Strategies

Implement independently pluggable strategies.

### ActiveFileStrategy

Highest priority.

### EntryPointStrategy

Examples:

Flutter:

```text
lib/main.dart
lib/main_*.dart
```

Node:

```text
src/index.ts
src/main.ts
app.ts
server.ts
```

### GitChangedStrategy

Use git status or VS Code SCM integration where available.

### RecentFilesStrategy

Local-only MRU list.

### NavigationHistoryStrategy

Track files/symbols used during CodePulse navigation/search.

---

## 11.2 Activity Monitor

Detect user activity through:

- active editor changes;
- document edits;
- selection changes;
- recent commands;
- focus changes.

If activity score is high:

```text
pause or reduce background concurrency
```

---

## 11.3 Scheduler

Configurable default:

```text
concurrency = 2
```

Rules:

- P0/P1 can preempt P5;
- background tasks cancellable;
- tasks deduplicated;
- file task can be promoted;
- same file cannot be processed twice concurrently.

---

## 11.4 Language Warmup

For each adapter:

```ts
warmup(context: WarmupContext): Promise<void>
```

Dart example:

- ensure important Dart document is available;
- request document symbols;
- run a low-cost provider query;
- never flood provider requests.

---

## 11.5 Warmup Status

Dashboard shows:

- current state;
- queue size;
- completed tasks;
- paused/running;
- reason paused;
- active strategy;
- elapsed time;
- files warmed.

---

## Phase 4 Definition of Done

- warmup can run automatically on workspace open;
- warmup is cancellable;
- user activity throttles it;
- active/recent/git-changed files receive priority;
- startup stays responsive;
- warmup metrics are visible;
- benchmark demonstrates measurable cold-navigation improvement on representative fixture projects.

---

# 12. Phase 5 — Fast Search

## Objective

Provide fast project-wide file/symbol/text search without waiting for language-server indexing.

## Features

### 12.1 File Search

Use local index.

Requirements:

- fuzzy matching;
- path matching;
- result ranking;
- configurable result limit.

---

### 12.2 Symbol Search

Use local symbol index.

Ranking inputs:

- exact match;
- prefix match;
- fuzzy score;
- recent usage;
- active project/module;
- file proximity.

---

### 12.3 Text Search

Use ripgrep.

Requirements:

- safe argument escaping;
- include/exclude support;
- cancellation;
- streaming results;
- maximum result count;
- timeout guard.

---

### 12.4 Search Result Merger

Unified result model:

```text
Files
Symbols
Text Matches
```

Do not mix without category metadata.

---

## Phase 5 Definition of Done

- file search returns in milliseconds for indexed projects;
- symbol search works without language-server workspace symbol readiness;
- text search streams and cancels correctly;
- generated/ignored folders respect configuration;
- dashboard can display search performance.

---

# 13. Phase 6 — Optimization Engine

## Objective

Turn diagnostics into safe, reviewable remediation.

## Initial Rules

### WATCHER_001

Large generated directory watched.

### SEARCH_001

Generated directory included in search.

### WORKSPACE_001

Nested build output detected.

### LANGUAGE_001

Cold provider startup is dominant.

### LANGUAGE_002

Provider slow even when warm.

### INDEX_001

Index frequently invalidated.

### FILE_001

Very large source file.

### FILE_002

Generated source dominates project.

### EXT_001

Possible overlapping language providers.

---

## Rule Output

Each rule returns:

```ts
{
  matched: boolean;
  severity,
  confidence,
  evidence,
  recommendation
}
```

---

## Apply Flow

```text
Finding
↓
Recommendation
↓
Preview Diff
↓
User Approval
↓
Apply
↓
Record Before Metrics
↓
Optional Reload
↓
Run Benchmark Again
↓
Show Before/After
```

---

## Phase 6 Definition of Done

- recommendations can be previewed;
- only safe settings are auto-applied;
- dangerous/manual actions remain informational;
- before/after benchmark comparison works;
- rollback path is clear.

---

# 14. Phase 7 — Fast Navigation

## Objective

Provide CodePulse-owned navigation commands.

Do not hijack native F12 by default.

## Commands

```text
CodePulse: Fast Go to Definition
CodePulse: Fast Find References
CodePulse: Search Symbols
```

---

## Navigation Modes

```text
native
hybrid
codepulse
```

Default:

```text
native
```

---

## 14.1 Fast Definition

Initial local strategy:

- identify symbol under cursor;
- query local index;
- rank candidates;
- open best candidate if confidence is sufficient;
- otherwise fallback to native provider.

---

## 14.2 Fast References

Initial implementation may use approximate/local references.

Results MUST be labeled:

```text
Indexed candidates
Confirmed semantic references
```

Do not pretend text matches are semantically guaranteed references.

---

## 14.3 Hybrid Navigation

Example:

```text
0–30ms:
show local candidate result

background:
ask native language provider

when native result returns:
validate / replace / merge
```

Need UI that does not flicker excessively.

---

## Phase 7 Definition of Done

- custom navigation commands work;
- fallback to native provider is reliable;
- local result confidence is explicit;
- user can select navigation mode;
- native F12 behavior remains untouched by default.

---

# 15. Phase 8 — Language-Specific Semantic Adapters

## Objective

Improve index quality and navigation accuracy.

## First Adapter: Dart/Flutter

Support:

- classes;
- mixins;
- enums;
- extensions;
- functions;
- methods;
- getters/setters;
- fields;
- imports;
- project structure;
- generated file filtering.

Potential implementation options:

- VS Code symbol provider;
- Dart analyzer integration if practical;
- tree-sitter Dart parser;
- custom lightweight parser for selected constructs.

Avoid coupling core to analyzer internals.

---

## Second Adapter: TypeScript

Support:

- classes;
- interfaces;
- types;
- functions;
- methods;
- variables;
- exports/imports.

---

## Phase 8 Definition of Done

- Dart adapter improves symbol accuracy over generic adapter;
- TypeScript adapter works through same adapter contract;
- no core module depends directly on Dart/TS implementation;
- adapter capability flags exist.

---

# 16. Phase 9 — Dependency Graph & Predictive Warmup

## Objective

Warm files the user is likely to navigate to next.

## Graph Nodes

- files;
- symbols;
- modules.

## Graph Edges

- import;
- export;
- call;
- inheritance where available;
- navigation history.

---

## Priority Formula

Example:

```text
priority =
  activeFileNeighbor * 6
+ gitChanged * 5
+ recentlyVisited * 4
+ navigationFrequency * 3
+ entryPoint * 3
+ dependencyDepthPenalty
```

Weights must be configurable internally.

---

## Local Usage History

Store only local metadata:

- file path hash or workspace-relative path;
- last visited time;
- navigation count;
- last search time.

Do not upload.

---

## Phase 9 Definition of Done

- dependency neighborhood can be queried;
- scheduler prioritizes likely next files;
- predictive warmup can be disabled;
- warmup improvement measurable against non-predictive baseline.

---

# 17. Phase 10 — Product Hardening

## Objective

Prepare for real-world marketplace usage.

## Areas

### Reliability

- recovery from database corruption;
- recovery from interrupted indexing;
- cancellation everywhere;
- graceful handling of missing language providers;
- workspace trust awareness.

### Performance

Targets:

```text
Activation:            < 50ms typical
Idle CPU:              ~0%
Default indexing jobs: <= 2 concurrent
Typing-time indexing:  paused/throttled
Memory target:         < 150MB typical medium project
```

### Security

- no arbitrary shell interpolation;
- ripgrep arguments escaped;
- CSP for webview;
- workspace trust support;
- no remote code execution;
- no source upload.

### Telemetry

Default design should work without telemetry.

If telemetry is ever added:

- opt-in;
- no source code;
- no symbol names;
- no file names;
- no project paths.

### Packaging

- VSIX;
- Marketplace metadata;
- changelog;
- privacy policy if telemetry exists;
- docs.

---

# 18. Dashboard Information Architecture

## Activity Bar

```text
⚡ CodePulse
```

## Pages

### Overview

- project health summary;
- current index status;
- warmup status;
- recent benchmark;
- top findings.

### Diagnostics

- run full diagnostic;
- run F12 benchmark;
- run references benchmark;
- run workspace symbol benchmark;
- evidence list.

### Index

- total indexed files;
- symbols;
- index size;
- schema version;
- queue;
- rebuild;
- clear;
- pause/resume.

### Warmup

- status;
- strategy;
- queue;
- current item;
- concurrency;
- pause reason.

### Recommendations

- finding;
- impact;
- confidence;
- evidence;
- diff preview;
- apply button.

### Settings

Expose extension-specific settings.

Native VS Code settings remain source of truth.

---

# 19. Configuration Contract

Initial settings:

```json
{
  "codePulse.enabled": true,
  "codePulse.diagnostics.enabled": true,
  "codePulse.diagnostics.slowThresholdMs": 500,

  "codePulse.index.enabled": true,
  "codePulse.index.generatedFiles": false,
  "codePulse.index.maxFileSizeBytes": 1048576,

  "codePulse.warmup.enabled": true,
  "codePulse.warmup.onStartup": true,
  "codePulse.warmup.concurrency": 2,
  "codePulse.warmup.useGitChanges": true,
  "codePulse.warmup.useRecentFiles": true,

  "codePulse.search.useRipgrep": true,

  "codePulse.navigation.mode": "native",

  "codePulse.logging.level": "info"
}
```

---

# 20. Commands Contract

```text
codePulse.openDashboard
codePulse.analyzeWorkspace
codePulse.runBenchmark
codePulse.runDefinitionBenchmark
codePulse.runReferenceBenchmark
codePulse.runWorkspaceSymbolBenchmark
codePulse.warmupProject
codePulse.rebuildIndex
codePulse.clearIndex
codePulse.pauseIndexing
codePulse.resumeIndexing
codePulse.fastGoToDefinition
codePulse.fastFindReferences
codePulse.searchSymbols
codePulse.applyRecommendation
```

---

# 21. Testing Strategy

## Unit Tests

Test:

- percentile calculation;
- exclude rules;
- file classification;
- priority scoring;
- queue deduplication;
- settings diff;
- fingerprint validation;
- finding rule evaluation;
- path normalization.

## Integration Tests

Test:

- workspace scan;
- index persist/restore;
- file create/update/delete;
- generated folders;
- warmup queue;
- recommendation apply.

## VS Code Extension Tests

Use VS Code test runner.

Test:

- command registration;
- webview open;
- workspace settings update;
- provider command execution;
- cancellation.

## Fixture Projects

Create:

```text
fixtures/flutter-small
fixtures/flutter-large
fixtures/typescript-small
fixtures/monorepo
fixtures/generated-heavy
```

---

# 22. Performance Test Scenarios

## Scenario A — Flutter Cold Start

Measure:

```text
workspace open
→ first definition
→ second definition
```

Compare:

```text
CodePulse disabled
CodePulse enabled, no warmup
CodePulse warmup enabled
```

---

## Scenario B — Generated Heavy Workspace

Include:

```text
build/
.dart_tool/
coverage/
```

Measure:

- workspace scan;
- file search;
- watcher recommendations.

---

## Scenario C — Large Symbol Count

Create many source files.

Measure:

- index restore;
- symbol query P50/P95;
- memory usage.

---

# 23. Release Milestones

## Milestone A — Diagnostic Preview

Includes:

- Phase 0;
- Phase 1;
- Phase 2.

Usable as a performance diagnostic extension.

## Milestone B — Indexing Preview

Includes:

- Phase 3;
- Phase 4;
- Phase 5.

Usable as warmup/search accelerator.

## Milestone C — Optimization Preview

Includes:

- Phase 6.

Can recommend and apply safe fixes.

## Milestone D — Navigation Preview

Includes:

- Phase 7;
- Phase 8.

Introduces CodePulse-owned navigation.

## Milestone E — Intelligent Warmup

Includes:

- Phase 9;
- Phase 10.

Production-ready optimization.

---

# 24. Global Definition of Done

A phase is NOT complete unless:

- implementation is merged;
- tests exist;
- cancellation is handled;
- errors are logged;
- dashboard state is updated;
- settings are documented;
- performance impact is measured;
- no synchronous heavy startup operation is introduced;
- no workspace mutation occurs without user approval.

---

# 25. Recommended Implementation Order

Strict order:

```text
Phase 0
↓
Phase 1
↓
Phase 2
↓
Phase 3
↓
Phase 4
↓
Phase 5
↓
Phase 6
↓
Phase 7
↓
Phase 8
↓
Phase 9
↓
Phase 10
```

Do not begin semantic reference indexing before:

- persistent index is stable;
- incremental invalidation is stable;
- cancellation is stable;
- scheduler/backpressure is stable.

---

# 26. Agent Handoff Rules

Any implementation agent working from this plan should follow these rules:

1. Do not redesign the entire architecture unless a hard platform limitation is discovered.
2. If a VS Code API is unavailable, preserve the interface and provide a fallback.
3. Prefer stable public VS Code APIs.
4. Keep language-specific logic behind `LanguageAdapter`.
5. Add tests with every new core module.
6. Every long-running operation must accept cancellation.
7. Every background operation must be scheduler-controlled.
8. Every settings mutation must go through `OptimizationEngine`.
9. Every recommendation must contain evidence.
10. Every performance claim must be benchmarked.
11. Avoid premature semantic indexing.
12. Keep native navigation as the default until CodePulse navigation is mature.
