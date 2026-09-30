# Code Intelligence Extension — Search Integration Task Breakdown

> Task list này bám sát `plan.md`.
>
> Rule bắt buộc:
>
> - ONE Project Index
> - ONE Workspace Watcher
> - ONE Worker Pool
> - ONE Resource Scheduler
> - Không full text index trong V1
> - Language Server vẫn là semantic source of truth

---

# EPIC 0 — Architecture Audit & Refactor

## 0.1 Audit existing codebase

- [ ] Liệt kê toàn bộ scanner hiện tại.
- [ ] Liệt kê toàn bộ watcher hiện tại.
- [ ] Liệt kê worker/thread/process hiện tại.
- [ ] Liệt kê index/cache hiện tại.
- [ ] Liệt kê service warmup.
- [ ] Liệt kê diagnostics service.
- [ ] Liệt kê settings/dashboard provider.
- [ ] Vẽ dependency graph.
- [ ] Đánh dấu duplicate responsibility.

## 0.2 Define module boundaries

- [ ] Tạo `core/`.
- [ ] Tạo `workspace/`.
- [ ] Tạo `scheduler/`.
- [ ] Tạo `index/`.
- [ ] Tạo `search/`.
- [ ] Tạo `language/`.
- [ ] Tạo `diagnostics/`.
- [ ] Tạo `cache/`.
- [ ] Tạo `ui/`.

## 0.3 Create shared interfaces

- [ ] `IEventBus`
- [ ] `IMetricsService`
- [ ] `IConfigurationService`
- [ ] `IWorkspaceScanner`
- [ ] `IWorkspaceWatcher`
- [ ] `IResourceScheduler`
- [ ] `IProjectIndexService`
- [ ] `ICacheManager`
- [ ] `ISearchService`

## 0.4 Refactor guardrail

- [ ] Xóa/merge duplicate watcher.
- [ ] Xóa/merge duplicate worker pool.
- [ ] Xóa/merge duplicate index service.
- [ ] Viết architecture comment/docs.
- [ ] Thêm test đảm bảo singleton per workspace.

---

# EPIC 1 — Core Infrastructure

## 1.1 Event Bus

- [ ] Tạo `EventBus.ts`.
- [ ] Define event types.
- [ ] Add subscribe/unsubscribe.
- [ ] Add scoped subscription.
- [ ] Add disposal handling.
- [ ] Add error isolation giữa subscribers.

## 1.2 Logging

- [ ] Tạo Logger abstraction.
- [ ] Support levels:
  - [ ] trace
  - [ ] debug
  - [ ] info
  - [ ] warn
  - [ ] error
- [ ] Add module name.
- [ ] Add operation ID.
- [ ] Add search session ID.
- [ ] Add optional file output.
- [ ] Add max log size/rotation.

## 1.3 Metrics

- [ ] Tạo `MetricsService`.
- [ ] Timer API.
- [ ] Counter API.
- [ ] Histogram API.
- [ ] P50 calculation.
- [ ] P95 calculation.
- [ ] Track memory estimates.
- [ ] Track queue size.
- [ ] Track worker utilization.

## 1.4 Cancellation

- [ ] Tạo `CancellationManager`.
- [ ] Support group cancellation.
- [ ] Support search session cancellation.
- [ ] Ensure process cancellation.
- [ ] Ensure worker job cancellation.
- [ ] Add cancellation unit tests.

---

# EPIC 2 — Resource Scheduler

## 2.1 Job model

- [ ] Define `JobPriority`.
- [ ] Define `JobType`.
- [ ] Define `ScheduledJob<T>`.
- [ ] Add job ID.
- [ ] Add group ID.
- [ ] Add cancellation token.
- [ ] Add estimated cost.

## 2.2 Priority Queue

- [ ] Implement priority queue.
- [ ] FIFO within same priority.
- [ ] Support removal/cancel.
- [ ] Support reprioritization.
- [ ] Unit test ordering.

## 2.3 Worker Pool

- [ ] Detect CPU count.
- [ ] Configurable worker limit.
- [ ] Worker lifecycle.
- [ ] Worker health check.
- [ ] Crash recovery.
- [ ] Graceful shutdown.
- [ ] No unbounded worker spawn.

## 2.4 Resource Scheduler

- [ ] `schedule()`.
- [ ] `cancel()`.
- [ ] `cancelByGroup()`.
- [ ] pause priority.
- [ ] resume priority.
- [ ] queue metrics.
- [ ] execution latency metrics.

## 2.5 Resource Governor

- [ ] Detect search active.
- [ ] Detect editor typing/activity.
- [ ] Detect startup period.
- [ ] Detect high queue pressure.
- [ ] Detect memory pressure if available.
- [ ] Dynamic worker throttling.
- [ ] Pause P4/P5/P6 during P0 bursts.

## 2.6 Scheduler tests

- [ ] P0 preempts/deprioritizes background work.
- [ ] Background job resumes.
- [ ] Cancellation works.
- [ ] Worker crash recovery.
- [ ] No starvation for background queue.

---

# EPIC 3 — Workspace Scanner & Watcher

## 3.1 IgnoreResolver

- [ ] Read `.gitignore`.
- [ ] Read `files.exclude`.
- [ ] Read `search.exclude`.
- [ ] Read extension custom exclude.
- [ ] Merge rules deterministically.
- [ ] Add generated file defaults.
- [ ] Unit tests for precedence.

## 3.2 WorkspaceScanner

- [ ] Scan multi-root workspace.
- [ ] Chunk file enumeration.
- [ ] Collect metadata.
- [ ] Avoid blocking Extension Host.
- [ ] Detect language/extension.
- [ ] Handle symlink safely.
- [ ] Report progress.

## 3.3 WorkspaceWatcher

- [ ] One watcher service.
- [ ] Create event.
- [ ] Change event.
- [ ] Delete event.
- [ ] Rename detection/handling.
- [ ] Workspace folder changed event.
- [ ] Debounce.
- [ ] Coalesce duplicate events.
- [ ] Batch burst events.

## 3.4 Bulk change protection

- [ ] Detect event storm.
- [ ] Switch to bulk mode.
- [ ] Avoid per-file expensive work.
- [ ] Queue batch incremental reindex.
- [ ] Add git checkout stress test.
- [ ] Add npm install stress test.
- [ ] Add Flutter build stress test.

---

# EPIC 4 — Project Index Service

## 4.1 Data models

- [ ] `FileRecord`.
- [ ] `SymbolRecord`.
- [ ] `IndexMetadata`.
- [ ] `WorkspaceMetadata`.
- [ ] `IndexHealth`.
- [ ] `IndexStats`.

## 4.2 File Index

- [ ] Index by file ID.
- [ ] Index by normalized filename.
- [ ] Index by path.
- [ ] Index by extension.
- [ ] Index by language.
- [ ] Add prefix lookup.
- [ ] Add fuzzy candidate lookup.

## 4.3 Symbol Index

- [ ] Index by symbol ID.
- [ ] Index by normalized symbol name.
- [ ] Index by kind.
- [ ] Index by file.
- [ ] Index by language.
- [ ] Index by container.

## 4.4 ProjectIndexService API

- [ ] `searchFiles()`.
- [ ] `searchSymbols()`.
- [ ] `getFile()`.
- [ ] `getSymbol()`.
- [ ] `getStats()`.
- [ ] `getHealth()`.
- [ ] `updateFile()`.
- [ ] `invalidateFile()`.
- [ ] `removeFile()`.

## 4.5 Performance tests

- [ ] 10k files.
- [ ] 50k files.
- [ ] 100k files.
- [ ] 250k files.
- [ ] 500k files.
- [ ] Measure memory.
- [ ] Measure lookup latency.

---

# EPIC 5 — Persistent Index

## 5.1 Storage layout

- [ ] Define index directory.
- [ ] Define `metadata.json`.
- [ ] Define `state.json`.
- [ ] Define `version.json`.
- [ ] Define file index serialization.
- [ ] Define symbol index serialization.

## 5.2 Workspace fingerprint

- [ ] Workspace root identity.
- [ ] Index schema version.
- [ ] Ignore rule hash.
- [ ] Relevant config hash.
- [ ] Optional Git identity.

## 5.3 Load path

- [ ] Read index metadata.
- [ ] Validate version.
- [ ] Validate workspace fingerprint.
- [ ] Load file index.
- [ ] Load symbol index.
- [ ] Publish load metrics.

## 5.4 Save path

- [ ] Atomic write.
- [ ] Temp file then rename.
- [ ] Crash-safe save.
- [ ] Periodic flush.
- [ ] Shutdown flush.

## 5.5 Corruption recovery

- [ ] Detect malformed metadata.
- [ ] Detect truncated index.
- [ ] Clear corrupt part.
- [ ] Rebuild only required portion.
- [ ] Log recovery reason.

---

# EPIC 6 — Incremental Indexing

## 6.1 File create

- [ ] Add file record.
- [ ] Extract symbol if needed.
- [ ] Invalidate search cache.

## 6.2 File change

- [ ] Update metadata.
- [ ] Remove old symbols.
- [ ] Re-extract symbols.
- [ ] Invalidate only affected cache.

## 6.3 File delete

- [ ] Remove file.
- [ ] Remove symbols.
- [ ] Invalidate cache/history reference.

## 6.4 Rename

- [ ] Update path.
- [ ] Preserve file ID if possible.
- [ ] Update symbol file reference.
- [ ] Invalidate path cache.

## 6.5 Batch update

- [ ] Batch file events.
- [ ] Limit concurrency.
- [ ] Lower scheduler priority.
- [ ] Pause if P0 search arrives.

---

# EPIC 7 — Symbol Provider Integration

## 7.1 Provider abstraction

- [ ] `SymbolProvider` interface.
- [ ] Document Symbol adapter.
- [ ] Workspace Symbol adapter.
- [ ] Language Server fallback.
- [ ] Timeout handling.

## 7.2 Symbol extraction

- [ ] Map VS Code SymbolKind.
- [ ] Normalize name.
- [ ] Store line/column.
- [ ] Store container.
- [ ] Store language.

## 7.3 Language-specific validation

- [ ] Dart/Flutter.
- [ ] TypeScript/JavaScript.
- [ ] Java.
- [ ] Optional C#/Go/Python smoke test.

## 7.4 Future fallback hook

- [ ] Define Tree-sitter adapter interface.
- [ ] Do not implement unless required.

---

# EPIC 8 — File Search Engine

## 8.1 Query normalization

- [ ] Lowercase/case-aware form.
- [ ] Tokenize path segments.
- [ ] Detect CamelCase.
- [ ] Detect extension hints.
- [ ] Preserve original query.

## 8.2 Candidate retrieval

- [ ] Exact bucket.
- [ ] Prefix bucket.
- [ ] Name token bucket.
- [ ] Path token bucket.
- [ ] Fuzzy fallback.

## 8.3 Fuzzy matcher

- [ ] Exact score.
- [ ] Prefix score.
- [ ] Word prefix score.
- [ ] CamelCase score.
- [ ] Subsequence score.
- [ ] Contains score.
- [ ] Gap penalty.
- [ ] Path depth penalty.

## 8.4 File search tests

- [ ] Exact filename.
- [ ] Extension omitted.
- [ ] CamelCase.
- [ ] Partial path.
- [ ] typo-like subsequence.
- [ ] same-name files in different folders.

---

# EPIC 9 — Class Search Engine

## 9.1 Class kind filter

- [ ] class
- [ ] interface
- [ ] enum
- [ ] struct
- [ ] mixin
- [ ] extension
- [ ] type alias

## 9.2 Class Search API

- [ ] Search by normalized name.
- [ ] Filter language.
- [ ] Filter path.
- [ ] Filter workspace root.
- [ ] Sort by score.

## 9.3 Tests

- [ ] Dart classes/mixins/extensions.
- [ ] TS classes/interfaces/types.
- [ ] Java classes/interfaces/enums.
- [ ] duplicate class names.

---

# EPIC 10 — Symbol Search Engine

## 10.1 Supported symbol kinds

- [ ] function
- [ ] method
- [ ] property
- [ ] variable
- [ ] namespace
- [ ] module
- [ ] class
- [ ] interface
- [ ] enum
- [ ] type

## 10.2 Filters

- [ ] kind
- [ ] language
- [ ] path
- [ ] workspace root
- [ ] current module

## 10.3 Tests

- [ ] thousands of symbols.
- [ ] same-name methods.
- [ ] nested symbol container.

---

# EPIC 11 — Query Parser

## 11.1 Basic query

- [ ] Plain text.
- [ ] Trim/normalize whitespace.

## 11.2 Advanced syntax

- [ ] `type:class`
- [ ] `file:dart`
- [ ] `ext:ts`
- [ ] `lang:dart`
- [ ] `path:auth`
- [ ] `kind:method`

## 11.3 Invalid syntax

- [ ] Graceful fallback.
- [ ] No crash.
- [ ] UI hint optional.

---

# EPIC 12 — Search Session & Cancellation

## 12.1 Session model

- [ ] sessionId.
- [ ] requestId.
- [ ] mode.
- [ ] query.
- [ ] filters.
- [ ] startedAt.
- [ ] cancellation token.

## 12.2 Request lifecycle

- [ ] Start.
- [ ] Stream partial.
- [ ] Complete.
- [ ] Cancel.
- [ ] Supersede old request.

## 12.3 Stale protection

- [ ] UI ignores old requestId.
- [ ] Backend drops obsolete result.
- [ ] Text search process killed.

---

# EPIC 13 — Search Query Cache

## 13.1 LRU

- [ ] Generic LRU implementation.
- [ ] Max entries.
- [ ] Max memory estimate.
- [ ] Eviction metrics.

## 13.2 Prefix reuse

- [ ] Reuse `u -> us -> use -> user`.
- [ ] Candidate narrowing.
- [ ] Fallback when query direction changes.

## 13.3 Invalidation

- [ ] File changed.
- [ ] Symbol changed.
- [ ] Ignore config changed.
- [ ] Workspace root changed.

---

# EPIC 14 — Ranking Engine

## 14.1 Ranking features

- [ ] exact match.
- [ ] prefix.
- [ ] CamelCase.
- [ ] subsequence.
- [ ] path score.
- [ ] type score.
- [ ] recency.
- [ ] frequency.
- [ ] current folder.
- [ ] current module.
- [ ] language affinity.

## 14.2 Score normalization

- [ ] File score normalization.
- [ ] Symbol score normalization.
- [ ] Text score normalization.
- [ ] Unified 0..1 or equivalent scale.

## 14.3 Exact-match guardrail

- [ ] Exact result cannot be buried by history.
- [ ] Add regression tests.

## 14.4 Debug mode

- [ ] Output score breakdown.
- [ ] Expose in diagnostics only.

---

# EPIC 15 — Search Everywhere

## 15.1 Source orchestration

- [ ] File engine.
- [ ] Class engine.
- [ ] Symbol engine.
- [ ] Recent/history source.
- [ ] Optional text source.

## 15.2 Query policy

- [ ] 1-2 chars: local index only.
- [ ] longer query: optionally text search.
- [ ] text mode: force ripgrep.
- [ ] user config threshold.

## 15.3 Result merger

- [ ] Merge sources.
- [ ] Normalize scores.
- [ ] Deduplicate.
- [ ] Top-K.
- [ ] Group labels.
- [ ] Stream first batch.

## 15.4 Performance

- [ ] First batch metric.
- [ ] Complete metric.
- [ ] Cancellation metric.

---

# EPIC 16 — Text Search Engine

## 16.1 ripgrep integration

- [ ] Detect rg binary.
- [ ] Build arguments.
- [ ] Spawn process.
- [ ] Parse output.
- [ ] Stream results.
- [ ] Kill on cancel.
- [ ] Handle exit code.

## 16.2 Search features

- [ ] literal.
- [ ] regex.
- [ ] whole word.
- [ ] case sensitive.
- [ ] smart case.
- [ ] include glob.
- [ ] exclude glob.
- [ ] language filter.
- [ ] path filter.
- [ ] result limit.

## 16.3 Safety/performance

- [ ] Prevent unbounded output.
- [ ] Backpressure.
- [ ] No zombie process.
- [ ] Timeout optional.
- [ ] Metrics.

---

# EPIC 17 — Search UI Foundation

## 17.1 Webview app

- [ ] App shell.
- [ ] VS Code theme integration.
- [ ] IPC bridge.
- [ ] State store.

## 17.2 Search input

- [ ] Debounce.
- [ ] IME-safe input.
- [ ] query mode.
- [ ] clear button.
- [ ] loading state.

## 17.3 Tabs

- [ ] All.
- [ ] Classes.
- [ ] Files.
- [ ] Symbols.
- [ ] Text.

## 17.4 Result list

- [ ] Virtualization.
- [ ] Selection.
- [ ] Active row.
- [ ] Match highlight.
- [ ] Icon.
- [ ] Path.
- [ ] Kind badge optional.
- [ ] Group separator.

## 17.5 Keyboard

- [ ] Up.
- [ ] Down.
- [ ] Enter.
- [ ] Ctrl/Cmd+Enter.
- [ ] Esc.
- [ ] Tab.
- [ ] Shift+Tab.

---

# EPIC 18 — Search Preview

## 18.1 Preview provider

- [ ] Read minimal range.
- [ ] Snippet cache.
- [ ] Match highlight.
- [ ] line numbers.
- [ ] symbol header.

## 18.2 Preview UI

- [ ] right panel.
- [ ] bottom panel option.
- [ ] toggle.
- [ ] responsive sizing.

## 18.3 Performance

- [ ] Cancel old preview read.
- [ ] Avoid full file load.
- [ ] Cache snippets.

---

# EPIC 19 — Search History & Usage

## 19.1 History storage

- [ ] Query history.
- [ ] Selected result history.
- [ ] Frequency.
- [ ] Last selected timestamp.

## 19.2 Ranking integration

- [ ] Recency bonus.
- [ ] Frequency bonus.
- [ ] Cap max history influence.

## 19.3 Settings

- [ ] Enable history.
- [ ] Clear history.
- [ ] Disable personalization.

---

# EPIC 20 — Search Diagnostics

## 20.1 Backend metrics

- [ ] query parse time.
- [ ] candidate fetch.
- [ ] fuzzy match.
- [ ] ranking.
- [ ] merge.
- [ ] rg first hit.
- [ ] rg total.
- [ ] cache hit rate.
- [ ] worker queue delay.

## 20.2 UI metrics

- [ ] IPC latency.
- [ ] first render.
- [ ] complete render.
- [ ] preview latency.

## 20.3 Slow query capture

- [ ] Config threshold.
- [ ] Record slow query metadata.
- [ ] No source-code content logging by default.

## 20.4 Dashboard

- [ ] P50 file search.
- [ ] P95 file search.
- [ ] P50 symbol search.
- [ ] P95 symbol search.
- [ ] text first-hit.
- [ ] cache hit rate.

---

# EPIC 21 — Adaptive Warmup Integration

## 21.1 Warmup tiers

- [ ] Tier 0 startup load.
- [ ] Tier 1 hot file warmup.
- [ ] Tier 2 index validation.
- [ ] Tier 3 stale refresh.

## 21.2 Search-aware policy

- [ ] Search starts -> pause low priority.
- [ ] Search ends -> resume.
- [ ] Navigation starts -> prioritize P1.
- [ ] Startup -> avoid full scan.

## 21.3 Warmup metrics

- [ ] time spent.
- [ ] files warmed.
- [ ] symbol refresh count.
- [ ] paused duration.

---

# EPIC 22 — Unified Settings / Control Center

## 22.1 Overview

- [ ] Workspace file count.
- [ ] Symbol count.
- [ ] Index size.
- [ ] Last index.
- [ ] Worker count.
- [ ] Queue state.
- [ ] Search performance.

## 22.2 Search settings

- [ ] default mode.
- [ ] search while typing.
- [ ] debounce.
- [ ] fuzzy.
- [ ] CamelCase.
- [ ] result limit.
- [ ] text threshold.
- [ ] remember mode.

## 22.3 Appearance

- [ ] width.
- [ ] height.
- [ ] row density.
- [ ] font size.
- [ ] show icon.
- [ ] show path.
- [ ] preview position.
- [ ] highlight style.

## 22.4 Indexing

- [ ] persistent index toggle.
- [ ] auto index.
- [ ] symbol index.
- [ ] exclusions.
- [ ] rebuild.
- [ ] clear index.
- [ ] pause/resume.

## 22.5 Performance

- [ ] worker count.
- [ ] cache size.
- [ ] memory limit.
- [ ] max result.
- [ ] search timeout.
- [ ] batch size.

## 22.6 History

- [ ] enable.
- [ ] clear.
- [ ] disable ranking personalization.

---

# EPIC 23 — Commands & Keybindings

## 23.1 Commands

- [ ] Search Everywhere.
- [ ] Search Class.
- [ ] Search File.
- [ ] Search Symbol.
- [ ] Search Text.
- [ ] Rebuild Index.
- [ ] Clear Index.
- [ ] Open Search Settings.
- [ ] Open Search Diagnostics.

## 23.2 Keybindings

- [ ] Safe defaults.
- [ ] No native hijack by default.
- [ ] Optional replace native shortcut.
- [ ] Conflict detection/documentation.

---

# EPIC 24 — Navigation Integration

## 24.1 Open result

- [ ] Open file.
- [ ] Reveal line.
- [ ] Reveal column.
- [ ] Focus editor.
- [ ] Open beside.

## 24.2 Language Server boundary

- [ ] Search result does not pretend to be semantic reference.
- [ ] F12 still routed to LSP/native VS Code.
- [ ] Indexed fallback labeled clearly.

---

# EPIC 25 — Large Repository Testing

## 25.1 Synthetic corpora

- [ ] 10k files.
- [ ] 50k files.
- [ ] 100k files.
- [ ] 250k files.
- [ ] 500k files.

## 25.2 Real-world projects

- [ ] Flutter monorepo.
- [ ] TypeScript monorepo.
- [ ] Java/Gradle project.
- [ ] Mixed-language workspace.

## 25.3 Stress scenarios

- [ ] Git branch switch.
- [ ] `npm install`.
- [ ] `pnpm install`.
- [ ] Flutter build.
- [ ] generated code burst.
- [ ] mass rename.
- [ ] delete large directory.
- [ ] multi-root add/remove.

## 25.4 KPIs

- [ ] File search P50 < 10ms.
- [ ] File search P95 < 30ms.
- [ ] Symbol/Class P50 < 20ms.
- [ ] Symbol/Class P95 < 50ms.
- [ ] Search Everywhere first useful result < 50ms warm.
- [ ] Text first hit < 100-200ms typical.
- [ ] UI target 60fps.

---

# EPIC 26 — Remote & Container Support

- [ ] WSL test.
- [ ] Remote SSH test.
- [ ] Dev Container test.
- [ ] Remote path abstraction.
- [ ] No local-filesystem assumptions.
- [ ] Persistent index location compatibility.

---

# EPIC 27 — Reliability

## 27.1 Index reliability

- [ ] Version migration.
- [ ] Corruption recovery.
- [ ] Partial rebuild.
- [ ] Atomic persistence.

## 27.2 Process reliability

- [ ] rg cleanup.
- [ ] worker cleanup.
- [ ] watcher disposal.
- [ ] no leaked timers.
- [ ] no leaked subscriptions.

## 27.3 UI reliability

- [ ] stale result prevention.
- [ ] stale preview prevention.
- [ ] reload webview recovery.
- [ ] theme change handling.

---

# EPIC 28 — Release Checklist

- [ ] ONE watcher verified.
- [ ] ONE worker pool verified.
- [ ] ONE project index verified.
- [ ] No full reindex on warm startup.
- [ ] Search cancellation works.
- [ ] Text process cancellation works.
- [ ] Ranking regression suite passes.
- [ ] Large repo benchmark passes.
- [ ] Memory benchmark documented.
- [ ] Branch-switch stress test passes.
- [ ] Settings migration tested.
- [ ] Keybinding conflict test passes.
- [ ] Remote workspace smoke test passes.
- [ ] Dashboard metrics verified.
- [ ] Diagnostic export verified.
- [ ] README updated.
- [ ] Architecture doc updated.

---

# Recommended Implementation Order

1. EPIC 0 — Architecture Audit
2. EPIC 1 — Core Infrastructure
3. EPIC 2 — Resource Scheduler
4. EPIC 3 — Workspace Scanner/Watcher
5. EPIC 4 — Project Index
6. EPIC 5 — Persistent Index
7. EPIC 6 — Incremental Index
8. EPIC 7 — Symbol Provider
9. EPIC 8 — File Search
10. EPIC 9 — Class Search
11. EPIC 10 — Symbol Search
12. EPIC 11 — Query Parser
13. EPIC 12 — Search Session
14. EPIC 13 — Query Cache
15. EPIC 14 — Ranking
16. EPIC 15 — Search Everywhere
17. EPIC 16 — Text Search
18. EPIC 17 — Search UI
19. EPIC 18 — Preview
20. EPIC 19 — History
21. EPIC 20 — Diagnostics
22. EPIC 21 — Warmup Integration
23. EPIC 22 — Settings
24. EPIC 23 — Commands/Keybindings
25. EPIC 24 — Navigation Integration
26. EPIC 25 — Large Repo Testing
27. EPIC 26 — Remote Support
28. EPIC 27 — Reliability
29. EPIC 28 — Release

---

# Agent Implementation Rules

Coding agent phải tuân thủ:

1. Không tự tạo watcher mới nếu `WorkspaceWatcher` đã tồn tại.
2. Không tự tạo worker pool mới.
3. Không tự tạo index service mới.
4. Không chạy file scan trong UI thread.
5. Không chạy full-text indexing ở V1.
6. Không gọi ripgrep cho query 1-2 ký tự trong Search Everywhere.
7. Query cũ phải cancel khi query mới đến.
8. Không render toàn bộ result list.
9. Không full rebuild index khi startup nếu persistent index valid.
10. Mọi background task phải đi qua `ResourceScheduler`.
11. Search interactive luôn priority cao hơn warmup/index maintenance.
12. Language Server vẫn authoritative cho semantic navigation.
13. Exact match phải có ranking ưu tiên.
14. Mọi performance optimization phải có metric/test đo trước và sau.
15. Mọi resource phải dispose sạch khi deactivate extension.
