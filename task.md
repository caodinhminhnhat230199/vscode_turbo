# CodePulse — Detailed Implementation Tasks

> This file converts `plan.md` into an implementation backlog suitable for an autonomous coding agent.

---

# 0. Task Execution Rules

Every task should be implemented with the following mandatory rules:

- Use TypeScript strict mode.
- Prefer stable VS Code public APIs.
- Do not block extension activation with heavy work.
- Every long-running function must support cancellation where practical.
- Every filesystem traversal must have excludes and bounds.
- Every background job must go through the scheduler after Phase 4 exists.
- Every configuration mutation must be explicit and reviewable.
- Every new core module requires unit tests.
- Every Phase ends with an end-to-end verification task.
- Do not start the next Phase until the Phase DoD is satisfied.

Task states recommended:

```text
TODO
IN_PROGRESS
BLOCKED
DONE
```

Priority:

```text
P0 = required for phase completion
P1 = important
P2 = optional enhancement
```

---

# PHASE 0 — PROJECT FOUNDATION

## P0.1 Initialize Extension Project

### Tasks

- [x] Create VS Code extension project.
- [x] Configure TypeScript strict mode.
- [x] Configure `engines.vscode`.
- [x] Configure `activationEvents`.
- [x] Configure extension entrypoint.
- [x] Add `esbuild` bundle script.
- [x] Add dev/watch build.
- [x] Add production build.
- [x] Add `.vscodeignore`.
- [x] Add local VSIX packaging command.

### Acceptance Criteria

- `npm run build` succeeds.
- extension launches in Extension Development Host.
- extension installs from generated VSIX.
- no unnecessary runtime dependencies are bundled.

---

## P0.2 Add Lint / Format / Test Foundation

### Tasks

- [x] Add ESLint.
- [x] Add Prettier if desired.
- [x] Add unit test runner.
- [x] Add VS Code extension test runner.
- [x] Add CI commands:
  - typecheck;
  - lint;
  - unit tests;
  - extension build.
- [x] Add test fixtures directory.

### Acceptance Criteria

- failing typecheck causes CI failure;
- unit test sample passes;
- extension test sample passes.

---

## P0.3 Implement Logger

### Files

```text
src/core/logging/Logger.ts
src/core/logging/LogLevel.ts
```

### Tasks

- [x] Create VS Code OutputChannel.
- [x] Support levels:
  - debug;
  - info;
  - warn;
  - error.
- [x] Respect `codePulse.logging.level`.
- [x] Add structured context fields where useful.
- [x] Ensure errors include stack where available.

### Acceptance Criteria

- log level configurable;
- logs visible in Output panel;
- no console-spam dependency.

---

## P0.4 Implement Configuration Service

### Files

```text
src/vscode/config.ts
```

### Tasks

- [x] Add strongly typed settings access.
- [x] Add defaults.
- [x] Add settings-change listener.
- [x] Add helper for workspace/global configuration scopes.
- [x] Add validation for numeric settings.

### Acceptance Criteria

- invalid values fallback safely;
- changing setting updates runtime state where possible.

---

## P0.5 Register Commands

### Files

```text
src/vscode/commands.ts
```

### Initial Commands

- [x] `codePulse.openDashboard`
- [x] `codePulse.analyzeWorkspace`
- [x] `codePulse.runBenchmark`
- [x] `codePulse.warmupProject`
- [x] `codePulse.rebuildIndex`
- [x] `codePulse.clearIndex`
- [x] `codePulse.pauseIndexing`
- [x] `codePulse.resumeIndexing`

Initially commands may show placeholder output when feature not implemented.

### Acceptance Criteria

- commands appear in Command Palette;
- commands do not throw before feature implementation.

---

## P0.6 Activity Bar + Dashboard Shell

### Tasks

- [x] Add CodePulse Activity Bar container.
- [x] Add Dashboard view.
- [x] Implement `WebviewViewProvider` or editor webview strategy.
- [x] Create React/Vite webview project.
- [x] Add Content Security Policy.
- [x] Add nonce-based script loading.
- [x] Add basic routing/pages:
  - Overview;
  - Diagnostics;
  - Index;
  - Warmup;
  - Recommendations;
  - Settings.
- [x] Add typed message protocol.

### Acceptance Criteria

- dashboard opens;
- webview renders;
- extension ↔ webview messaging works;
- CSP has no unsafe broad wildcard.

---

## P0.7 Shared State Store

### Tasks

- [x] Define dashboard state model.
- [x] Add in-extension state store.
- [x] Add publish/subscribe.
- [x] Push state snapshot to webview.
- [x] Handle webview reconnect.

### Acceptance Criteria

- dashboard survives reopen;
- current state is re-sent without requiring re-run.

---

## P0.8 Workspace Metadata Persistence

### Tasks

- [x] Use `workspaceState` for lightweight workspace metadata.
- [x] Use `globalState` only for cross-workspace configuration/metadata.
- [x] Define storage version.
- [x] Add migration placeholder.

### Acceptance Criteria

- persistence version stored;
- incompatible version can be detected.

---

## P0.9 Phase 0 Verification

- [x] Measure extension activation baseline.
- [x] Document activation duration.
- [x] Verify no workspace traversal during synchronous activation.
- [x] Verify dashboard works on empty workspace.
- [x] Verify multi-root workspace does not crash.

---

# PHASE 1 — WORKSPACE DIAGNOSTICS MVP

## P1.1 Implement WorkspaceDetector

### Files

```text
src/core/workspace/WorkspaceDetector.ts
src/core/workspace/WorkspaceState.ts
```

### Tasks

- [x] Read all workspace folders.
- [x] Normalize workspace roots.
- [x] Support multi-root.
- [x] Identify active root from current editor.
- [x] Emit workspace-changed events.

### Acceptance Criteria

- zero-root, single-root, and multi-root cases handled.

---

## P1.2 Implement Project-Type Detection

### Tasks

- [x] Create detector interface.
- [x] Implement Dart/Flutter detector.
- [x] Implement Node/TS detector.
- [x] Implement Java detector.
- [x] Implement Python detector.
- [x] Allow multiple project types in one workspace.
- [x] Add confidence score.

### Acceptance Criteria

Flutter fixture should detect:

```text
language: Dart
framework: Flutter
confidence: high
```

---

## P1.3 Build Bounded Workspace Scanner

### Tasks

- [x] Traverse workspace with configurable limits.
- [x] Count directories.
- [x] Count files by extension.
- [x] Approximate total size.
- [x] Find largest files.
- [x] Track max directory depth.
- [x] Identify generated/build folders.
- [x] Respect known exclusions.
- [x] Support cancellation.
- [x] Yield periodically to avoid blocking extension host.

### Guardrails

- maximum scanned files;
- maximum traversal time;
- max file metadata queue size.

### Acceptance Criteria

- scanning 50k-file fixture remains responsive;
- cancellation stops promptly;
- symlink loops are avoided.

---

## P1.4 File Classification

### Tasks

Create classifier:

```ts
classifyFile(path): {
  source: boolean;
  generated: boolean;
  buildArtifact: boolean;
  dependency: boolean;
}
```

- [x] Add Flutter rules.
- [x] Add Node rules.
- [x] Add generic rules.
- [x] Make generated detection explainable.

### Tests

- `.g.dart`
- `.freezed.dart`
- `build/`
- `.dart_tool/`
- `node_modules/`
- `dist/`

---

## P1.5 Read Effective Exclude Settings

### Tasks

- [x] Read:
  - `files.exclude`
  - `files.watcherExclude`
  - `search.exclude`
- [x] Resolve effective values.
- [x] Preserve existing user patterns.
- [x] Handle language/workspace override behavior where relevant.

### Acceptance Criteria

- output shows existing patterns exactly;
- no mutation in read path.

---

## P1.6 Create Diagnostic Domain Models

### Files

```text
src/diagnostics/model/Finding.ts
src/diagnostics/model/Evidence.ts
src/diagnostics/model/Recommendation.ts
```

### Tasks

- [x] Implement types from plan.
- [x] Add stable finding IDs.
- [x] Add JSON serialization.
- [x] Add source metadata.

---

## P1.7 Implement Initial Diagnostic Rules

### Rules

- [x] WATCHER_001 — generated folder not watcher-excluded.
- [x] SEARCH_001 — generated folder not search-excluded.
- [x] WORKSPACE_001 — very high file count.
- [x] WORKSPACE_002 — excessive generated-file ratio.
- [x] FILE_001 — very large source file.
- [x] FILE_002 — excessive generated source.

### Each Rule Must Return

- evidence;
- severity;
- confidence;
- recommendation;
- rationale.

---

## P1.8 Implement Settings Diff

### Files

```text
src/optimizer/SettingsDiff.ts
```

### Tasks

- [x] Compare before/after values.
- [x] Preserve unrelated entries.
- [x] Produce human-readable diff.
- [x] Produce machine-applicable patch.
- [x] Validate patch before apply.

### Acceptance Criteria

- applying new exclude does not remove existing patterns.

---

## P1.9 Implement Recommendation Apply Flow

### Tasks

- [x] User clicks Apply.
- [x] Show diff.
- [x] Confirm.
- [x] Update workspace setting.
- [x] Record previous value in current session.
- [x] Provide Undo action.
- [x] Refresh diagnostics.

### Acceptance Criteria

- no silent apply;
- failed write reports useful error.

---

## P1.10 Diagnostics Dashboard

### UI

- [x] project summary card;
- [x] total files;
- [x] source files;
- [x] generated files;
- [x] detected languages;
- [x] findings list;
- [x] severity badges;
- [x] confidence label;
- [x] evidence details;
- [x] Apply recommendation CTA.

---

## P1.11 Phase 1 Verification

- [x] Test Flutter project.
- [x] Test Node project.
- [x] Test generated-heavy project.
- [x] Test multi-root project.
- [x] Verify all settings changes are reversible.
- [x] Record scan duration on large fixture.

---

# PHASE 2 — BENCHMARK & PERFORMANCE DIAGNOSTICS

## P2.1 Benchmark Types

Create:

```text
src/benchmark/benchmarkTypes.ts
```

### Tasks

- [x] Define operation enum.
- [x] Define sample model.
- [x] Define result model.
- [x] Define timeout result.
- [x] Define cancellation result.

---

## P2.2 Percentile Utility

### Tasks

- [x] Implement:
  - min;
  - max;
  - P50;
  - P75;
  - P90;
  - P95.
- [x] Test odd/even sample counts.
- [x] Test empty input.
- [x] Test one sample.

---

## P2.3 BenchmarkRunner

### API

```ts
run({
  operation,
  warmupIterations,
  iterations,
  timeoutMs,
  execute,
  token
})
```

### Tasks

- [x] warmup iterations excluded from metrics;
- [x] timed iterations;
- [x] timeout guard;
- [x] cancellation;
- [x] collect errors separately;
- [x] avoid concurrent duplicate benchmark for same operation.

---

## P2.4 Definition Benchmark

### Tasks

- [x] Determine cursor symbol position.
- [x] Call `vscode.executeDefinitionProvider`.
- [x] Measure duration.
- [x] Record result count.
- [x] Handle no provider.
- [x] Handle empty result.
- [x] Handle timeout.

### UI

- [x] show cold result;
- [x] show warm result;
- [x] show percentile table.

---

## P2.5 References Benchmark

Same structure as definition.

Use:

```text
vscode.executeReferenceProvider
```

---

## P2.6 Workspace Symbol Benchmark

Use:

```text
vscode.executeWorkspaceSymbolProvider
```

### Query Selection

- [x] user-provided query;
- [x] fallback from active symbol;
- [x] never generate pathological broad query automatically.

---

## P2.7 File Search Benchmark

### Tasks

- [x] choose representative search query.
- [x] measure indexed/non-indexed search when relevant.
- [x] return count + duration.

---

## P2.8 Cold/Warm Classifier

### Tasks

- [x] Add configurable thresholds.
- [x] Implement heuristic categories.
- [x] Add unit tests.

Example:

```text
cold P50 >= 2000ms
warm P50 <= 300ms
=> LANGUAGE_COLD_START
```

---

## P2.9 Language Diagnostic Rules

- [x] LANGUAGE_001 — cold start dominant.
- [x] LANGUAGE_002 — consistently slow warm provider.
- [x] LANGUAGE_003 — provider timeouts.
- [x] LANGUAGE_004 — no provider available.

---

## P2.10 Benchmark Dashboard

### UI

- [x] operation selector;
- [x] Run button;
- [x] Cancel button;
- [x] progress;
- [x] percentile results;
- [x] cold vs warm comparison;
- [x] findings generated from benchmark.

---

## P2.11 Phase 2 Verification

- [x] benchmark cancellation works.
- [x] provider absence handled.
- [x] no benchmark auto-runs by default.
- [x] large reference results do not freeze UI.
- [x] benchmark history retained for current session.

---

# PHASE 3 — PERSISTENT FILE + SYMBOL INDEX

## P3.1 Define Index Models

### Files

```text
FileRecord.ts
SymbolRecord.ts
ReferenceRecord.ts
FileFingerprint.ts
```

### Required Fields

File:

- id;
- path;
- relativePath;
- language;
- size;
- mtime;
- generated.

Symbol:

- id;
- fileId;
- name;
- kind;
- line;
- column;
- containerName;
- adapterId.

---

## P3.2 IndexStore Interface

Implement complete interface from plan.

### Tasks

- [x] lifecycle;
- [x] file CRUD;
- [x] symbol replace;
- [x] lookup;
- [x] clear;
- [x] schema version;
- [x] transaction support if backend supports it.

---

## P3.3 MemoryIndexStore

### Purpose

Use for tests and early integration.

### Tasks

- [x] implement all interface methods;
- [x] deterministic ranking;
- [x] no persistence.

---

## P3.4 Persistent Store Selection Spike

### Tasks

- [x] validate SQLite/WASM inside VS Code extension host;
- [x] test packaging;
- [x] test Windows/macOS/Linux;
- [x] measure open/write/query overhead;
- [x] document decision.

### Exit Criteria

Pick production storage.

---

## P3.5 SqliteIndexStore

If SQLite/WASM selected:

- [x] schema creation;
- [x] migrations;
- [x] indexes;
- [x] transaction batch insert;
- [x] corruption detection;
- [x] DB close.

### DB Indexes

- [x] files(path)
- [x] symbols(name)
- [x] symbols(file_id)

---

## P3.6 WorkspaceFingerprint

### Include

- workspace roots;
- project config metadata;
- CodePulse schema version.

### Tasks

- [x] compute fingerprint;
- [x] compare previous fingerprint;
- [x] invalidate when necessary.

---

## P3.7 File Fingerprint

### Fast Path

```text
size + mtime
```

### Slow Path

optional hash.

### Tasks

- [x] normalize timestamps;
- [x] avoid hash unless ambiguity exists;
- [x] test timestamp precision edge cases.

---

## P3.8 GenericLanguageAdapter

### Tasks

- [x] detect provider availability.
- [x] open document lazily.
- [x] call `vscode.executeDocumentSymbolProvider`.
- [x] normalize VS Code symbols to SymbolRecord.
- [x] close/release no-longer-needed resources naturally.
- [x] handle SymbolInformation vs DocumentSymbol shapes.

---

## P3.9 AdapterRegistry

### Tasks

- [x] register adapters.
- [x] lookup adapter by language/project.
- [x] expose capability flags.
- [x] fallback to generic adapter.

---

## P3.10 Initial Index Build

### Pipeline

```text
discover files
→ classify
→ filter ignored
→ fingerprint
→ adapter.extractSymbols
→ persist
```

### Guardrails

- [x] max file size;
- [x] generated-file setting;
- [x] cancellation;
- [x] bounded concurrency;
- [x] progress reporting.

---

## P3.11 Index Restore

### Tasks

- [x] open existing DB.
- [x] validate schema version.
- [x] compare workspace fingerprint.
- [x] restore file metadata.
- [x] queue only changed/new files.
- [x] remove deleted files.

---

## P3.12 File Watcher

### Tasks

- [x] create broad workspace watcher.
- [x] exclude ignored/generated paths.
- [x] handle create.
- [x] handle change.
- [x] handle delete.
- [x] debounce bursts.
- [x] deduplicate events.

---

## P3.13 Incremental Reindex

### Tasks

- [x] invalidate file.
- [x] delete stale symbols.
- [x] re-extract.
- [x] persist transactionally.
- [x] publish index update event.

---

## P3.14 Index Commands

- [x] Rebuild Index.
- [x] Clear Index.
- [x] Pause Indexing.
- [x] Resume Indexing.

---

## P3.15 Index Dashboard

Display:

- [x] indexed files;
- [x] indexed symbols;
- [x] DB size;
- [x] queue count;
- [x] last index duration;
- [x] schema version;
- [x] current status.

---

## P3.16 Phase 3 Verification

- [x] restart VS Code and restore index.
- [x] modify one file; only one file reindexed.
- [x] delete file; records removed.
- [x] create file; indexed.
- [x] DB corruption fallback works.
- [x] full rebuild command works.

---

# PHASE 4 — WARMUP ENGINE

## P4.1 Warmup Task Model

Define:

```ts
interface WarmupTask {
  id: string;
  uri: Uri;
  priority: number;
  source: WarmupSource;
  reason: string;
}
```

---

## P4.2 Priority Queue

### Requirements

- [x] stable priority ordering;
- [x] deduplication;
- [x] priority promotion;
- [x] cancellation;
- [x] queue size metrics.

---

## P4.3 ActivityMonitor

### Inputs

- [x] document edits;
- [x] active editor change;
- [x] selection change;
- [x] window focus;
- [x] navigation command activity.

### Output

```text
idle
low activity
high activity
```

### Acceptance Criteria

- rapid typing causes background work to throttle.

---

## P4.4 WarmupScheduler

### Requirements

- [x] configurable concurrency.
- [x] default = 2.
- [x] pause on high activity.
- [x] resume when idle.
- [x] P0/P1 preempts background.
- [x] no duplicate file warmup.

---

## P4.5 ActiveFileStrategy

- [x] active editor file = highest priority.
- [x] update when active editor changes.

---

## P4.6 EntryPointStrategy

### Dart

Detect:

- `lib/main.dart`
- `lib/main_*.dart`

### TS/Node

Detect common entrypoints.

---

## P4.7 GitChangedStrategy

### Tasks

- [x] discover Git extension API if available;
- [x] fallback to git process only if safe and necessary;
- [x] never shell-interpolate workspace path unsafely;
- [x] collect modified/untracked files;
- [x] assign high priority.

---

## P4.8 RecentFilesStrategy

### Tasks

- [x] maintain workspace-local MRU.
- [x] cap list length.
- [x] persist timestamps.
- [x] ignore generated files.

---

## P4.9 Language Warmup Adapter Contract

Add:

```ts
warmup?(context): Promise<void>
```

### Generic Warmup

- [x] request document symbols.
- [x] optionally request definition for known symbol.
- [x] never flood provider.

---

## P4.10 WarmupEngine

### Pipeline

- [x] restore index.
- [x] gather strategies.
- [x] merge tasks.
- [x] schedule tasks.
- [x] update dashboard.
- [x] handle cancellation.

---

## P4.11 Startup Warmup

### Tasks

- [x] trigger after extension activation settles.
- [x] respect `codePulse.warmup.onStartup`.
- [x] do not show noisy notification.
- [x] status bar reflects progress.

---

## P4.12 Warmup Dashboard

Display:

- [x] running/paused.
- [x] pause reason.
- [x] current file.
- [x] queue size.
- [x] completed tasks.
- [x] strategy source.
- [x] elapsed time.
- [x] concurrency.

---

## P4.13 Phase 4 Verification

- [x] open large Flutter fixture.
- [x] ensure UI remains responsive.
- [x] typing pauses/throttles warmup.
- [x] benchmark cold F12 before/after.
- [x] measure CPU and memory.

---

# PHASE 5 — FAST SEARCH

## P5.1 FileSearchEngine

### Features

- [x] exact filename match;
- [x] prefix match;
- [x] path substring;
- [x] fuzzy match;
- [x] ranking;
- [x] limit.

---

## P5.2 SymbolSearchEngine

### Ranking Signals

- exact match;
- prefix;
- fuzzy;
- recent usage;
- active root;
- active file neighborhood.

### Tasks

- [x] implement baseline ranking.
- [x] deterministic test cases.

---

## P5.3 RipgrepEngine

### Tasks

- [x] locate usable ripgrep binary strategy.
- [x] safe spawning.
- [x] escape args.
- [x] stream stdout.
- [x] parse matches.
- [x] cancel process.
- [x] kill on timeout.
- [x] enforce max results.

---

## P5.4 Search Excludes

### Tasks

- [x] merge CodePulse excludes.
- [x] merge workspace search excludes.
- [x] exclude generated/build defaults.
- [x] allow override.

---

## P5.5 SearchResultMerger

### Unified Model

```ts
type SearchResult =
  | FileResult
  | SymbolResult
  | TextResult;
```

### Tasks

- [x] preserve category.
- [x] stable ordering.
- [x] no duplicate file+symbol entries where inappropriate.

---

## P5.6 Search UI

### Tasks

- [x] add Search panel or QuickPick command.
- [x] support tabs/categories.
- [x] keyboard navigation.
- [x] open selected result.
- [x] cancellation on query change.

---

## P5.7 Search Benchmark

- [x] measure file lookup.
- [x] symbol lookup.
- [x] text search.
- [x] show P50/P95 over repeated queries.

---

## P5.8 Phase 5 Verification

- [x] query large project.
- [x] result appears quickly.
- [x] cancellation works while typing.
- [x] ignored folders not searched.
- [x] no shell-injection risk.

---

# PHASE 6 — OPTIMIZATION ENGINE

## P6.1 Optimization Rule Contract

```ts
interface OptimizationRule {
  id: string;
  evaluate(context): Promise<PerformanceFinding | null>;
}
```

---

## P6.2 Implement Rule Registry

- [x] register rules.
- [x] evaluate independently.
- [x] catch rule failure without aborting whole diagnostic.
- [x] sort findings by severity/impact.

---

## P6.3 WATCHER_001

### Conditions

- generated directory exists;
- contains significant file count;
- not excluded from watcher.

### Evidence

- directory path;
- file count;
- estimated percentage of workspace files.

### Recommendation

Add watcher exclude.

---

## P6.4 SEARCH_001

Same model for search.exclude.

---

## P6.5 LANGUAGE_001

### Conditions

Cold definition/reference high, warm low.

### Recommendation

- enable CodePulse warmup;
- explain language-server cold indexing;
- optionally suggest relevant existing VS Code setting only if evidence exists.

Do not invent settings.

---

## P6.6 LANGUAGE_002

Warm provider consistently slow.

### Recommendation

Inform user:

- provider itself is slow;
- CodePulse cannot guarantee fix;
- local index/search can help selected workflows.

---

## P6.7 INDEX_001

Detect excessive reindex rate.

Potential evidence:

- repeated changes;
- generated files being watched;
- index invalidations/minute.

---

## P6.8 Extension Conflict Heuristic

### Tasks

- [x] inspect installed/active extensions.
- [x] find multiple extensions contributing overlapping language capabilities only where inferable.
- [x] present as "possible overlap", never definitive CPU attribution.

### Do Not

- claim extension CPU usage without valid measurement.
- disable extension automatically.

---

## P6.9 Recommendation Apply Service

### Tasks

- [x] validate recommendation.
- [x] produce diff.
- [x] request approval.
- [x] apply.
- [x] capture before benchmark reference.
- [x] rerun diagnostics.

---

## P6.10 Before/After Metrics

### Tasks

- [x] store pre-change benchmark.
- [x] rerun selected benchmark.
- [x] display delta:
  - absolute;
  - percentage.
- [x] handle worse result honestly.

---

## P6.11 Recommendations Dashboard

### UI

- [x] finding card.
- [x] evidence.
- [x] severity.
- [x] confidence.
- [x] diff preview.
- [x] Apply.
- [x] Ignore.
- [x] Undo where possible.
- [x] before/after.

---

## P6.12 Phase 6 Verification

- [x] recommendation apply preserves unrelated settings.
- [x] undo works.
- [x] benchmark can show improvement or regression.
- [x] misleading confidence avoided.

---

# PHASE 7 — FAST NAVIGATION

## P7.1 Navigation Mode Config

Values:

```text
native
hybrid
codepulse
```

Default native.

---

## P7.2 Symbol Under Cursor Resolver

### Tasks

- [x] use document word range.
- [x] adapter-specific resolver hook.
- [x] handle qualified names.
- [x] handle no symbol.

---

## P7.3 DefinitionEngine

### Local Lookup

- [x] query symbol index.
- [x] rank candidate.
- [x] use active workspace root.
- [x] use container name when available.
- [x] confidence score.

### Fallback

- [x] native executeDefinitionProvider.

---

## P7.4 Fast Go to Definition Command

### Behavior

Native mode:

- call native only.

Hybrid:

- query local;
- if high confidence, navigate immediately;
- asynchronously verify native where practical.

CodePulse mode:

- local first;
- fallback native when confidence low/no result.

---

## P7.5 Reference Candidate Index

Initial approach may be textual/import-based.

### Mandatory Label

Results must indicate:

```text
candidate
confirmed
```

No false semantic guarantee.

---

## P7.6 ReferenceEngine

### Tasks

- [x] local candidate lookup.
- [x] native reference provider lookup.
- [x] merge.
- [x] deduplicate.
- [x] tag confidence/source.

---

## P7.7 Fast Find References UI

Use:

- QuickPick;
- custom references panel;
- or editor location list.

Must support:

- open location;
- group by file;
- source label.

---

## P7.8 Hybrid Result Reconciliation

### Tasks

- [x] avoid jump-back/flicker.
- [x] if native contradicts local definition, notify minimally.
- [x] prefer native semantic result when available.

---

## P7.9 Phase 7 Verification

- [x] native mode unchanged.
- [x] hybrid works on Dart fixture.
- [x] no provider conflict introduced.
- [x] candidate references clearly labeled.

---

# PHASE 8 — LANGUAGE-SPECIFIC ADAPTERS

## P8.1 Expand LanguageAdapter Contract

Capabilities:

```ts
supportsSymbols
supportsWarmup
supportsImports
supportsReferences
supportsDependencyGraph
```

---

## P8.2 DartLanguageAdapter

### Detection

- [x] pubspec.
- [x] analysis options.
- [x] Dart language ID.

### Symbol Support

- [x] class.
- [x] mixin.
- [x] enum.
- [x] extension.
- [x] top-level function.
- [x] method.
- [x] getter.
- [x] setter.
- [x] field.

### File Rules

- [x] exclude build.
- [x] exclude .dart_tool.
- [x] generated file toggle.

---

## P8.3 Dart Import Extraction

### Tasks

- [x] extract import/export directives.
- [x] resolve package-relative imports where feasible.
- [x] record file dependency edges.

---

## P8.4 Dart Warmup Strategy

Priority:

- active Dart file;
- main.dart;
- git-changed;
- recent;
- imported neighbors.

---

## P8.5 TypeScriptLanguageAdapter

### Support

- [x] classes.
- [x] interfaces.
- [x] types.
- [x] functions.
- [x] methods.
- [x] variables.
- [x] imports/exports.

---

## P8.6 Adapter Comparison Tests

### Tasks

- [x] same generic core with Dart.
- [x] same generic core with TS.
- [x] verify no core import from adapter implementation.

---

## P8.7 Phase 8 Verification

- [x] Dart symbol accuracy improves.
- [x] TS works without changes to index core.
- [x] capability flags drive behavior safely.

---

# PHASE 9 — DEPENDENCY GRAPH & PREDICTIVE WARMUP

## P9.1 Graph Storage Model

Nodes:

- file;
- optional symbol.

Edges:

- import;
- export;
- navigation;
- reference/call if available.

---

## P9.2 Persist Graph

### Tasks

- [x] graph schema.
- [x] incremental edge replacement per file.
- [x] cleanup on delete.
- [x] query neighbors.

---

## P9.3 Navigation History

### Tasks

- [x] record successful CodePulse navigation.
- [x] record recent file usage.
- [x] cap history.
- [x] local only.
- [x] setting to disable.

---

## P9.4 Priority Calculator

Implement weighted score.

### Inputs

- active neighbor;
- git changed;
- recent;
- frequency;
- entrypoint;
- dependency distance.

### Tests

- active dependency outranks unrelated background file.
- git changed outranks old recent file.

---

## P9.5 PredictiveWarmupStrategy

### Tasks

- [x] query graph around active file.
- [x] limit depth.
- [x] limit node count.
- [x] enqueue top-ranked neighbors.

---

## P9.6 Adaptive Scheduling

Optional P1:

- [x] reduce concurrency during CPU pressure proxy.
- [x] expand slightly when idle.

Do not rely on fragile OS-specific APIs.

---

## P9.7 Phase 9 Verification

- [x] compare cold navigation baseline.
- [x] compare regular warmup.
- [x] compare predictive warmup.
- [x] record measurable delta.

---

# PHASE 10 — PRODUCT HARDENING

## P10.1 Error Boundaries

### Tasks

- [x] webview error boundary.
- [x] per-rule diagnostic isolation.
- [x] index-store failure isolation.
- [x] fallback when adapter fails.

---

## P10.2 Database Recovery

### Tasks

- [x] corruption detection.
- [x] backup/rename bad DB.
- [x] rebuild path.
- [x] user-visible status.

---

## P10.3 Workspace Trust

### Tasks

- [x] inspect workspace trust.
- [x] disable risky process-spawning if untrusted.
- [x] document reduced functionality.

---

## P10.4 Webview Security

- [x] strict CSP.
- [x] no arbitrary remote scripts.
- [x] sanitize rendered values.
- [x] validate all webview messages.

---

## P10.5 Process Security

Ripgrep/git:

- [x] no shell string interpolation.
- [x] use spawn args array.
- [x] validate binary path.
- [x] kill child process on dispose/cancel.

---

## P10.6 Performance Budget Tests

### Targets

- [x] activation < 50ms typical.
- [x] idle CPU ~0%.
- [x] warmup concurrency default 2.
- [x] memory under target on medium fixture.
- [x] typing remains responsive during warmup.

---

## P10.7 Extension Disposal

### Tasks

Dispose:

- [x] watchers;
- [x] status bar;
- [x] output channel;
- [x] webview subscriptions;
- [x] background queues;
- [x] child processes;
- [x] DB handles.

---

## P10.8 Marketplace Packaging

### Tasks

- [x] README.
- [x] screenshots.
- [x] feature documentation.
- [x] configuration docs.
- [x] commands docs.
- [x] changelog.
- [x] license.
- [x] privacy statement if necessary.
- [x] icon.
- [x] VSIX smoke test.

---

## P10.9 Final Regression Matrix

Test:

- [x] Windows.
- [x] macOS.
- [x] Linux.
- [x] empty workspace.
- [x] single-root.
- [x] multi-root.
- [x] Flutter.
- [x] TypeScript.
- [x] generated-heavy workspace.
- [x] very large workspace.
- [x] workspace trust disabled.
- [x] language provider unavailable.
- [x] corrupted index.
- [x] index disabled.
- [x] warmup disabled.

---

# CROSS-CUTTING TASKS

# C1. Status Bar

States:

```text
Ready
Scanning
Benchmarking
Indexing 42%
Warmup 71%
Paused
3 Issues
Error
```

Tasks:

- [x] single status bar controller.
- [x] tooltip.
- [x] click opens dashboard.
- [x] avoid status flicker.

---

# C2. Cancellation Standard

Every long task accepts a token:

```ts
CancellationToken
```

or an internal abort abstraction.

Must support:

- workspace scan;
- benchmark;
- index build;
- warmup;
- ripgrep search;
- optimization recheck.

---

# C3. Event Bus

Events:

```text
workspaceChanged
diagnosticsUpdated
benchmarkCompleted
indexUpdated
indexProgress
warmupUpdated
findingUpdated
configurationChanged
```

Requirements:

- [x] typed events.
- [x] no circular import mess.
- [x] unsubscribe support.

---

# C4. Metrics Collector

Track locally:

- operation durations;
- queue sizes;
- index durations;
- warmup durations;
- result counts.

Do not collect source content.

---

# C5. Performance Regression Suite

Create scripted benchmark fixtures.

Must compare:

```text
baseline branch
current branch
```

Metrics:

- activation;
- scan;
- index restore;
- symbol query;
- warmup total;
- memory where practical.

---

# C6. Documentation

Each module should include:

- purpose;
- API;
- failure behavior;
- cancellation behavior;
- performance characteristics.

---

# SUGGESTED IMPLEMENTATION SPRINTS

## Sprint 1

- [x] Phase 0 complete.

## Sprint 2

- [x] P1.1 → P1.6.

## Sprint 3

- [x] P1.7 → P1.11.

## Sprint 4

- [x] Phase 2 complete.

## Sprint 5

- [x] P3.1 → P3.8.

## Sprint 6

- [x] P3.9 → P3.16.

## Sprint 7

- [x] Phase 4 complete.

## Sprint 8

- [x] Phase 5 complete.

## Sprint 9

- [x] Phase 6 complete.

## Sprint 10

- [x] Phase 7 complete.

## Sprint 11

- [x] Phase 8 complete.

## Sprint 12

- [x] Phase 9 + Phase 10.

---

# AGENT IMPLEMENTATION CHECKLIST

Before coding any task:

- [x] read relevant section in `plan.md`.
- [x] inspect existing interfaces.
- [x] identify dependency tasks.
- [x] avoid duplicate abstractions.

Before marking DONE:

- [x] build passes.
- [x] typecheck passes.
- [x] lint passes.
- [x] relevant tests added.
- [x] relevant tests pass.
- [x] cancellation behavior tested.
- [x] logging added.
- [x] UI/state updated where relevant.
- [x] performance impact checked.
- [x] no hidden settings mutation.

---

# FINAL DELIVERY CRITERIA

The project is considered production-ready when all of the following are true:

- [x] 1. It can diagnose a large Flutter project without freezing VS Code.
- [x] 2. It can show evidence explaining slow navigation/search behavior.
- [x] 3. It can safely recommend watcher/search exclusions.
- [x] 4. It can benchmark cold/warm definition and reference performance.
- [x] 5. It can persist and restore a local file/symbol index.
- [x] 6. It can incrementally update the index.
- [x] 7. It can warm important project files while yielding to user activity.
- [x] 8. It can provide fast file/symbol search.
- [x] 9. It can show before/after optimization metrics.
- [x] 10. It can provide optional CodePulse-owned navigation without hijacking native F12 by default.
- [x] 11. It has a usable dashboard and settings experience.
- [x] 12. It stays within the defined extension-host performance budget.
- [x] 13. It recovers safely from index corruption or provider failure.
- [x] 14. It is tested on Windows/macOS/Linux.
- [x] 15. It can be packaged and installed as a VSIX without manual runtime setup.
