# Code Intelligence Extension — Search Integration Plan

## 0. Mục tiêu tài liệu

Tài liệu này mô tả kế hoạch tích hợp **Search Experience kiểu IntelliJ/Android Studio** vào extension Code Intelligence đã có trước đó, extension vốn chịu trách nhiệm:

- Phân tích nguyên nhân gây chậm:
  - Go to Definition / F12
  - Find References
  - Workspace search
  - Language Server
  - Extension Host
- Warm-up/indexing project
- Chẩn đoán bottleneck
- Dashboard/Settings
- Tối ưu hiệu năng navigation/search trong VS Code

Mục tiêu mới là thêm:

- Search Everywhere
- Search Class
- Search File
- Search Symbol
- Search Text
- Search UI kiểu JetBrains/Android Studio
- Ranking/Fuzzy search
- Preview
- Search history
- Search settings
- Search diagnostics

Nhưng **không được tạo một hệ thống indexing/search thứ hai độc lập** gây conflict với extension cũ.

---

# 1. Kiến trúc tổng thể

## 1.1. Kiến trúc mục tiêu

```text
VS Code Extension
│
├── Search Intelligence
│   ├── Search Everywhere
│   ├── Search Class
│   ├── Search File
│   ├── Search Symbol
│   ├── Search Text
│   ├── Search Ranking
│   ├── Search Preview
│   └── Search History
│
├── Performance Intelligence
│   ├── F12 Diagnostics
│   ├── Find References Diagnostics
│   ├── Language Server Monitor
│   ├── Extension Host Monitor
│   ├── Warmup Policy
│   └── Optimization Advisor
│
└── Shared Core
    ├── ProjectIndexService
    ├── WorkspaceScanner
    ├── WorkspaceWatcher
    ├── ResourceScheduler
    ├── WorkerPool
    ├── ResourceGovernor
    ├── CacheManager
    ├── PersistentStorage
    ├── EventBus
    ├── MetricsService
    └── ConfigurationService
```

---

# 2. Architectural Guardrails

Các rule dưới đây là **bắt buộc**.

## 2.1. One Index per Workspace

Chỉ có:

```text
ProjectIndexService
```

Không được tạo:

```text
SearchIndexService
PerformanceIndexService
WarmupIndexService
```

`ProjectIndexService` quản lý:

- File index
- Symbol index
- Class/type metadata
- File metadata
- Workspace metadata
- Index version
- Index health
- Persistent index
- Incremental updates

---

## 2.2. One Workspace Watcher

Chỉ một service:

```text
WorkspaceWatcher
```

Publish event qua `EventBus`:

```text
fileCreated
fileChanged
fileDeleted
fileRenamed
bulkChangeDetected
workspaceFoldersChanged
```

Consumers:

- ProjectIndexService
- CacheManager
- Diagnostics
- Search Intelligence
- Warmup Manager

---

## 2.3. One Worker Pool

Không module nào được tự spawn worker pool riêng.

Tất cả job CPU/I/O nặng phải đi qua:

```text
ResourceScheduler
  -> WorkerPool
```

---

## 2.4. Priority-based Scheduling

Priority bắt buộc:

```text
P0 INTERACTIVE_SEARCH
P1 NAVIGATION
P2 INCREMENTAL_INDEX
P3 USER_TRIGGERED_DIAGNOSTIC
P4 WARMUP
P5 BACKGROUND_INDEX
P6 MAINTENANCE
```

Rule:

- P0 không chờ P4/P5/P6.
- Khi user typing/search active:
  - pause/deprioritize warmup
  - pause/deprioritize background indexing
- Khi CPU/memory cao:
  - giảm số worker
  - trì hoãn maintenance
- Khi startup:
  - không rebuild index ngay nếu persistent index hợp lệ.

---

## 2.5. Search Index không thay Language Server

Local index dùng cho:

- Search File
- Search Class
- Search Symbol
- Search Everywhere
- Fallback discovery

Language Server vẫn authoritative cho:

- Go to Definition
- Find References
- Rename
- Type hierarchy
- Call hierarchy
- Semantic resolution

---

## 2.6. Text Search không build full inverted index ở V1

V1/V2 dùng:

```text
ripgrep
```

Không persistent-index toàn bộ text.

Lý do:

- tránh tăng memory
- tránh tăng disk
- tránh reindex khổng lồ
- giảm watcher workload
- giảm branch-switch cost

---

# 3. Source Structure

```text
src/
├── extension.ts
│
├── core/
│   ├── events/
│   │   ├── EventBus.ts
│   │   └── EventTypes.ts
│   ├── logging/
│   │   └── Logger.ts
│   ├── metrics/
│   │   ├── MetricsService.ts
│   │   └── MetricTypes.ts
│   ├── cancellation/
│   │   └── CancellationManager.ts
│   ├── lifecycle/
│   │   └── LifecycleManager.ts
│   └── config/
│       └── ConfigurationService.ts
│
├── workspace/
│   ├── WorkspaceScanner.ts
│   ├── WorkspaceWatcher.ts
│   ├── IgnoreResolver.ts
│   ├── WorkspaceFingerprint.ts
│   └── WorkspaceState.ts
│
├── scheduler/
│   ├── ResourceScheduler.ts
│   ├── WorkerPool.ts
│   ├── PriorityQueue.ts
│   ├── ResourceGovernor.ts
│   └── JobTypes.ts
│
├── index/
│   ├── ProjectIndexService.ts
│   ├── FileIndex.ts
│   ├── SymbolIndex.ts
│   ├── IndexStorage.ts
│   ├── IndexUpdater.ts
│   ├── IndexValidator.ts
│   ├── IndexVersion.ts
│   └── models/
│
├── search/
│   ├── SearchService.ts
│   ├── SearchSession.ts
│   ├── QueryParser.ts
│   ├── ResultMerger.ts
│   ├── SearchHistoryService.ts
│   ├── engines/
│   │   ├── FileSearchEngine.ts
│   │   ├── ClassSearchEngine.ts
│   │   ├── SymbolSearchEngine.ts
│   │   └── TextSearchEngine.ts
│   └── ranking/
│       ├── FuzzyMatcher.ts
│       ├── RankingEngine.ts
│       ├── RankingFeatures.ts
│       └── ScoreNormalizer.ts
│
├── language/
│   ├── LanguageServerMonitor.ts
│   ├── SymbolProvider.ts
│   ├── LanguageAdapter.ts
│   └── WarmupManager.ts
│
├── diagnostics/
│   ├── DefinitionDiagnostics.ts
│   ├── ReferencesDiagnostics.ts
│   ├── SearchDiagnostics.ts
│   ├── WorkspaceDiagnostics.ts
│   └── DiagnosticReport.ts
│
├── cache/
│   ├── CacheManager.ts
│   ├── LRUCache.ts
│   └── SearchQueryCache.ts
│
└── ui/
    ├── search/
    ├── dashboard/
    ├── settings/
    └── shared/
```

---

# 4. Phase 0 — Refactor & Shared Core Boundary

## Mục tiêu

Chuẩn hóa boundary giữa extension cũ và Search module trước khi viết Search Engine.

## Công việc

- Audit code hiện tại:
  - scanner
  - watcher
  - worker
  - cache
  - index
  - diagnostics
  - settings
- Xác định module duplicate.
- Tạo shared interfaces.
- Tạo dependency graph.
- Tách module domain:
  - core
  - workspace
  - scheduler
  - index
  - search
  - diagnostics
  - UI
- Đảm bảo Search không truy cập filesystem trực tiếp ngoài service được phép.

## Deliverables

- Shared architecture
- Interface contracts
- Refactor plan
- Migration notes

## Acceptance Criteria

- Không còn hơn một watcher.
- Không còn hơn một worker pool.
- Index được expose qua `ProjectIndexService`.
- Search module chưa cần hoạt động nhưng compile được trên shared architecture mới.

---

# 5. Phase 1 — Resource Scheduler & Worker Infrastructure

## Mục tiêu

Tạo nền tảng scheduling để Search không conflict với warmup/indexing.

## Features

### ResourceScheduler

API đề xuất:

```ts
schedule<T>(job: ScheduledJob<T>): Promise<T>
cancel(jobId: string): void
cancelByGroup(groupId: string): void
pause(priority?: JobPriority): void
resume(priority?: JobPriority): void
```

### Job metadata

```ts
type ScheduledJob = {
  id: string;
  groupId?: string;
  priority: JobPriority;
  cancellable: boolean;
  estimatedCost?: 'low' | 'medium' | 'high';
  type: JobType;
}
```

### ResourceGovernor

Theo dõi:

- active workers
- queue size
- job latency
- CPU pressure
- memory pressure
- user interaction
- VS Code startup
- current search activity

### Policy

Khi:

```text
Search active
```

thì:

```text
P4/P5/P6 -> deprioritize/pause
```

## Acceptance Criteria

- Interactive search luôn được schedule trước warmup.
- Background indexing có thể pause/resume.
- Cancellation không leak Promise/event listener.
- Worker crash không crash extension.
- Job metrics được record.

---

# 6. Phase 2 — Workspace Infrastructure Consolidation

## Mục tiêu

Một scanner + một watcher + một ignore policy dùng chung.

## WorkspaceScanner

Responsibilities:

- enumerate files
- respect ignore rules
- detect language
- collect basic metadata
- support multi-root workspace
- avoid symlink loop
- chunk results

## IgnoreResolver

Merge:

- `.gitignore`
- `files.exclude`
- `search.exclude`
- extension custom exclude
- generated file patterns

Default excludes:

```text
.git
node_modules
build
dist
coverage
.next
.gradle
.idea
.dart_tool
Pods
DerivedData
```

## WorkspaceWatcher

Events:

```text
create
change
delete
rename
workspace root change
bulk change
```

Need debounce/coalescing.

## Acceptance Criteria

- Không duplicate watcher.
- `npm install`/Flutter build không flood extension.
- Bulk file events được batch.
- Multi-root workspace hoạt động.
- Ignore rules consistent giữa indexing và search.

---

# 7. Phase 3 — Unified Project Index

## Mục tiêu

Tạo `ProjectIndexService` duy nhất.

## File Index

Store:

```text
fileId
fileName
relativePath
extension
languageId
folder
mtime
size
workspaceRoot
```

## Symbol Index

Store:

```text
symbolId
name
kind
fileId
line
column
containerName
languageId
workspaceRoot
```

Kinds:

- class
- interface
- enum
- struct
- mixin
- extension
- function
- method
- property
- variable
- namespace
- module
- type alias

## Data structures

V1 ưu tiên:

- dense array
- map by normalized name
- prefix lookup
- optional trie
- sorted token table

Không bắt buộc SQLite trên hot path.

## APIs

```ts
searchFiles(query, options)
searchSymbols(query, options)
getFile(fileId)
getSymbol(symbolId)
getStats()
getHealth()
invalidateFile(fileId)
updateFile(file)
```

## Acceptance Criteria

- File lookup warm search < 20ms typical.
- Symbol lookup < 30-50ms typical.
- Có index stats.
- Không block Extension Host.

---

# 8. Phase 4 — Persistent & Incremental Index

## Mục tiêu

Không rebuild toàn workspace mỗi lần mở VS Code.

## Persistent storage

Store:

```text
workspaceHash/
├── files.idx
├── symbols.idx
├── metadata.json
├── state.json
└── version.json
```

## Workspace fingerprint

Có thể dựa trên:

- workspace roots
- config
- index schema version
- include/exclude rules
- file metadata
- optional Git metadata

## Startup flow

```text
Activate extension
  -> read metadata
  -> validate index
  -> load index
  -> schedule stale validation
  -> update changed files only
```

## Incremental update

Events:

- create
- change
- delete
- rename

Không full rebuild trừ khi:

- schema version incompatible
- index corrupted
- user force rebuild
- ignore rules changed lớn
- workspace identity changed

## Acceptance Criteria

- Warm startup không rebuild toàn project.
- File change chỉ reindex file liên quan.
- Index corruption recover được.
- Version migration rõ ràng.

---

# 9. Phase 5 — Search File Engine

## Mục tiêu

Search file nhanh như IDE.

## Query support

- exact
- prefix
- subsequence
- fuzzy
- camelCase
- path-aware

Examples:

```text
user_service
usrsrv
US
service/user
auth user
```

## Ranking

Features:

- exact name
- exact stem
- prefix
- word prefix
- camelCase
- subsequence
- path match
- current folder bonus
- recently opened bonus
- frequently opened bonus

## Performance target

```text
P50 < 10ms
P95 < 30ms
```

với index đã load.

## Acceptance Criteria

- 100k+ files vẫn responsive.
- Search cancel được.
- Không scan disk mỗi query.

---

# 10. Phase 6 — Search Class & Symbol Engine

## Mục tiêu

Thêm search theo class/type/symbol.

## Symbol source

Ưu tiên:

1. VS Code Document Symbol Provider
2. Workspace Symbol Provider
3. Language Server
4. Optional Tree-sitter fallback later

## Search Class filters

Bao gồm:

- class
- interface
- enum
- struct
- mixin
- extension
- type alias

## Search Symbol filters

Bao gồm tất cả symbol kinds.

## Acceptance Criteria

- Class search không lẫn quá nhiều method/function.
- Symbol search hỗ trợ filter theo kind/language/path.
- Language Server vẫn là semantic source of truth.

---

# 11. Phase 7 — Search Everywhere Core

## Mục tiêu

Một search box tổng hợp.

## Sources

- files
- classes
- symbols
- recent
- history
- text fallback

## Query execution policy

### Query ngắn

1-2 ký tự:

- không chạy ripgrep text toàn workspace
- ưu tiên file/class/symbol

### Query dài

- chạy local index trước
- có thể chạy text search theo threshold/config

## ResultMerger

Responsibilities:

- merge result từ nhiều engine
- normalize score
- deduplicate
- group
- stream top results sớm

## Acceptance Criteria

- First useful result < 50ms warm path.
- Không block vì text search.
- Search result cập nhật progressive.

---

# 12. Phase 8 — Text Search with ripgrep

## Mục tiêu

Thay thế/augment VS Code text search bằng engine riêng nhưng hiệu năng cao.

## Features

- literal search
- regex
- whole word
- case sensitive
- smart case
- include glob
- exclude glob
- path filter
- language filter
- max result limit
- streaming
- cancellation

## Process management

- spawn/call `rg`
- capture stdout stream
- parse incremental result
- terminate process khi query bị cancel

## Acceptance Criteria

- Cancel query cũ khi user tiếp tục gõ.
- First result xuất hiện sớm.
- Không giữ zombie rg process.
- Respect ignore settings.

---

# 13. Phase 9 — Search Session, Cache & Cancellation

## Mục tiêu

Tối ưu trải nghiệm gõ liên tục.

## SearchSession

Mỗi UI query có:

```text
sessionId
requestId
query
mode
filters
startedAt
cancelToken
```

## Prefix reuse

```text
u
us
use
user
```

Query sau có thể reuse candidate set query trước.

## Cache

- LRU
- query cache
- normalized query cache
- recent result cache

## Acceptance Criteria

- Query cũ bị cancel ngay.
- Không render result stale.
- Cache invalidation khi file/symbol thay đổi.

---

# 14. Phase 10 — Ranking Engine

## Mục tiêu

Kết quả giống JetBrains hơn VS Code default.

## Score components

```text
match score
type score
path score
recency score
frequency score
current folder score
current module score
language score
```

## Guardrail

Exact match phải luôn có trọng số cao.

Không để personalization đẩy fuzzy result vượt exact result.

## Score normalization

Vì:

- File engine
- Symbol engine
- Text engine

có score scale khác nhau.

Cần `ScoreNormalizer`.

## Acceptance Criteria

- Exact class/file luôn nổi bật.
- Ranking deterministic.
- Có unit test cho corpus cố định.
- Có debug breakdown per result.

---

# 15. Phase 11 — JetBrains-style Search UI

## Mục tiêu

Custom UI search gần Android Studio/IntelliJ.

## UI

```text
┌───────────────────────────────────────────────┐
│ Search Everywhere                        ⚙    │
├───────────────────────────────────────────────┤
│ All  Classes  Files  Symbols  Text             │
├───────────────────────────────────────────────┤
│ > user service                                │
├───────────────────────────────────────────────┤
│ C UserService        lib/services/...         │
│ C UserServiceImpl    lib/services/...         │
│ F user_service.dart  lib/services/...         │
│ M getUserService     locator.dart             │
├───────────────────────────────────────────────┤
│ Preview                                      │
└───────────────────────────────────────────────┘
```

## Features

- tabs
- keyboard navigation
- virtualized list
- match highlight
- icon by kind
- relative path
- preview
- split preview
- recent search
- loading state
- indexing state
- diagnostics hint

## Keyboard

- Up/Down
- Enter
- Ctrl/Cmd+Enter
- Escape
- Tab/Shift+Tab
- shortcut per mode

## Acceptance Criteria

- UI không render toàn bộ result list.
- 60fps khi navigate.
- Không stale result.
- Keyboard-first usable.

---

# 16. Phase 12 — Search Preview

## Mục tiêu

Preview nhanh không cần mở file.

## Behavior

- load range xung quanh match
- không load toàn file nếu không cần
- syntax highlight nếu feasible
- highlight matched token
- show path, line, symbol kind

## Acceptance Criteria

- Preview update < 50ms typical.
- Navigate result không gây disk thrash.
- Có cache snippet.

---

# 17. Phase 13 — Search History & Usage Signals

## Mục tiêu

Cải thiện ranking theo hành vi nhưng không phá exact matching.

## Track local-only

- search query
- selected result
- result type
- selection frequency
- last opened time

## Use for

- recency
- frequency
- recent files

## Privacy

Mặc định local-only.

Không external telemetry trừ khi project có policy riêng.

---

# 18. Phase 14 — Performance Diagnostics Integration

## Mục tiêu

Search trở thành một phần của Performance Intelligence.

## Search diagnostics

Record:

```text
query parse
candidate fetch
fuzzy match
ranking
sort
merge
IPC
UI render
text first hit
total
```

## Example

```text
Query: UserService

Parse           0.3 ms
Index lookup    2.1 ms
Ranking         4.8 ms
Merge           0.9 ms
IPC             0.7 ms
Render          4.0 ms

Total          12.8 ms
```

## Correlation với extension cũ

Ví dụ:

```text
F12 slow = 2200ms
local symbol lookup = 4ms
```

=> bottleneck có thể nằm ở LSP.

## Acceptance Criteria

- Search metrics hiển thị trong dashboard.
- Có p50/p95.
- Có slow query log.
- Có export diagnostic report.

---

# 19. Phase 15 — Adaptive Warmup Integration

## Mục tiêu

Search và warmup hỗ trợ nhau thay vì cạnh tranh.

## Tier 0 — Startup

Load:

- index metadata
- file index
- symbol index
- recent files

## Tier 1 — Hot Files

Warm:

- opened files
- recent files
- current module
- current folder

## Tier 2 — Index Validation

Idle:

- stale file validation
- symbol refresh

## Tier 3 — Background Refresh

Long idle:

- stale symbols
- cache compaction
- metadata maintenance

## Rule

Interactive Search > Navigation > Incremental Index > Warmup > Background.

---

# 20. Phase 16 — Unified Settings / Control Center

## Mục tiêu

Một UI settings chung.

## Sections

```text
Overview

Search
├── General
├── Ranking
├── Text Search
├── Preview
└── History

Indexing
├── Workspace
├── Symbols
├── Persistence
└── Exclusions

Performance
├── CPU
├── Worker Pool
├── Cache
└── Memory

Language Servers
├── Dart
├── TypeScript
├── Java
└── ...

Appearance

Keybindings

Diagnostics

Advanced
```

## Search Appearance

- width
- height
- font size
- row density
- show icon
- show path
- preview position
- theme
- highlight style

## Search Behavior

- default mode
- search while typing
- debounce
- fuzzy enable
- camelCase enable
- text search threshold
- result limit
- remember last mode

## Acceptance Criteria

- Setting update phản ánh runtime.
- Không cần restart cho phần lớn option.
- Có Reset to Default.

---

# 21. Phase 17 — Keybinding Strategy

## Mục tiêu

Không conflict với VS Code/extension khác.

## V1

Expose commands:

```text
Code Intelligence: Search Everywhere
Code Intelligence: Search Class
Code Intelligence: Search File
Code Intelligence: Search Symbol
Code Intelligence: Search Text
```

Default keybinding hạn chế.

Không hijack ngay:

```text
Ctrl+Shift+F
Ctrl+P
F12
```

## Optional

Setting:

```text
Replace native VS Code search shortcuts
```

User bật mới override.

---

# 22. Phase 18 — Large Workspace & Monorepo Hardening

## Test scales

- 10k files
- 50k files
- 100k files
- 250k files
- 500k files

## Scenarios

- Flutter project
- TypeScript monorepo
- Java/Gradle project
- mixed-language monorepo
- multi-root workspace

## Stress events

- git checkout
- git pull large diff
- npm install
- pnpm install
- Flutter build
- generated code burst
- branch switch
- delete/rename directory lớn

## Acceptance Criteria

- Không event storm crash.
- Không duplicate index.
- Memory bounded.
- Search vẫn responsive khi background events xảy ra.

---

# 23. Phase 19 — Remote/Container Support

Support:

- WSL
- Remote SSH
- Dev Containers
- remote workspace
- multi-root remote/local mixed scenarios nếu VS Code support

Phải tránh assumption:

```text
local filesystem == workspace filesystem
```

---

# 24. Phase 20 — Benchmark & Release Readiness

## Performance KPIs

### Search File

```text
P50 < 10ms
P95 < 30ms
```

### Search Symbol/Class

```text
P50 < 20ms
P95 < 50ms
```

### Search Everywhere

```text
First useful result < 50ms warm
```

### Text Search

```text
First result < 100-200ms typical SSD project
```

### UI

```text
target 60fps
```

### Startup

Extension activation không được full scan workspace synchronously.

## Release checklist

- no duplicate watcher
- no duplicate worker pool
- no duplicate index
- no leaked process
- no stale result
- cancellation tested
- index migration tested
- corruption recovery tested
- remote workspace smoke test
- large repo benchmark
- memory benchmark
- keybinding conflict test

---

# 25. Milestone Mapping

## v0.1

- Shared Core
- Scheduler
- WorkspaceScanner/Watcher
- Unified File Index
- File Search
- Basic Search UI

## v0.2

- Symbol Index
- Class Search
- Symbol Search
- Persistent index
- Incremental updates

## v0.3

- Search Everywhere
- Ranking engine
- Query cache
- cancellation
- history

## v0.4

- Text Search via ripgrep
- filters
- preview
- advanced UI

## v0.5

- Search Diagnostics
- Adaptive Warmup
- Control Center integration
- performance tuning

## v1.0

- Large workspace hardening
- Multi-root
- Remote support
- Stable migrations
- Full benchmark target
- Production-ready search experience

---

# 26. Non-Goals V1

Không làm ngay:

- custom semantic reference engine
- custom rename engine
- full compiler replacement
- full inverted text index
- AI semantic search
- AST index cho mọi language
- distributed index
- cloud index

Các feature này có thể nằm sau V1.

---

# 27. Definition of Done

Search feature được xem là hoàn tất khi:

1. Dùng chung core với extension performance.
2. Chỉ có một watcher.
3. Chỉ có một worker pool.
4. Chỉ có một project index.
5. File/Class/Symbol search dùng index.
6. Text search dùng ripgrep.
7. Search Everywhere merge nhiều source.
8. UI hỗ trợ keyboard + virtualization.
9. Search có cancellation.
10. Search không tranh CPU với warmup.
11. Dashboard hiển thị search performance.
12. Settings có thể điều chỉnh UI/search/index/performance.
13. Warm startup không full reindex.
14. Branch switch không gây freeze.
15. Large workspace benchmark đạt target đã định.
