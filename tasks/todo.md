# Search Recovery Task List

Plan chi tiết: `tasks/plan.md`. Roadmap gốc `plan_search.md`/`task_search.md` chỉ dùng làm tài liệu tham khảo; checklist dưới đây là nguồn trạng thái triển khai cho recovery này.

## Task 1: Reproduce runtime search failure

**Description:** Tạo regression harness chứng minh search dùng stale store sau configure, đồng thời khóa contract URI/line/column và readiness.

**Acceptance criteria:**

- [x] Test thất bại trên source hiện tại vì engine không đọc store mới sau configure.
- [x] Fixture chứng minh file, class, symbol và text result mở đúng target.
- [x] Test phân biệt `indexing`, `ready`, `disabled` và `error`, không chấp nhận empty result mơ hồ.
- [x] Activation test chờ readiness signal thay vì fixed 25 ms sleep và không còn flaky dưới full-suite load.

**Verification:**

- [x] Focused test đỏ trước fix và xanh sau Task 2.
- [x] `npm.cmd run compile` pass.

**Dependencies:** None

**Files likely touched:**

- `test/unit/search/SearchRuntimeIntegration.test.ts`
- `test/fixtures/search-workspace/*`
- `test/mocks/vscode.ts`

**Estimated scope:** Medium

## Task 2: Fix index/store lifecycle wiring

**Description:** Loại bỏ `IndexStore` snapshot trong engine singleton; mọi query dùng current store qua `ProjectIndexService`/provider và có readiness contract.

**Acceptance criteria:**

- [x] Reconfigure/initialize không để search đọc store cũ.
- [x] Symbol/class search trả kết quả từ persistent store sau activation.
- [x] Query khi index chưa ready trả state/fallback xác định, có log chẩn đoán.

**Verification:**

- [x] Task 1 regression tests xanh.
- [x] Existing index restore/rebuild tests xanh.

**Dependencies:** Task 1

**Files likely touched:**

- `src/index/ProjectIndexService.ts`
- `src/search/SearchService.ts`
- `src/search/engine/FileSearchEngine.ts`
- `src/search/engine/SymbolSearchEngine.ts`
- `src/core/interfaces/IProjectIndexService.ts`

**Estimated scope:** Medium

## Task 3: Correct query, path, and navigation semantics

**Description:** Nối filter parser vào engine, sửa root-relative path/multi-root metadata và thống nhất zero-based positions.

**Acceptance criteria:**

- [x] `type/kind/path/ext/lang` filter cho kết quả đúng; value không hợp lệ có feedback.
- [x] Path search dùng workspace-relative path, không chỉ basename.
- [x] Enter mở đúng dòng/cột cho symbol và text result, không off-by-one.

**Verification:**

- [x] Unit test cho từng filter và multi-root path.
- [x] Navigation integration test xác nhận editor selection.

**Dependencies:** Task 2

**Files likely touched:**

- `src/search/QueryParser.ts`
- `src/search/models/SearchOptions.ts`
- `src/index/engine/IndexEngine.ts`
- `src/search/SearchService.ts`
- `test/unit/search/QueryParser.test.ts`

**Estimated scope:** Medium

## Task 4: Consolidate to one production search pipeline

**Description:** Cho Quick Pick, Search Everywhere commands và benchmark dùng chung `SearchController -> SearchService`; xóa/thu gọn coordinator cũ sau khi parity đã được test.

**Acceptance criteria:**

- [x] Không còn hai orchestration/ranking/cancellation implementation độc lập.
- [x] `quickSearch` và các command theo mode trả cùng thứ tự result cho cùng request.
- [x] Benchmark đo đúng production service.

**Verification:**

- [x] Parity test giữa entry points.
- [x] Không còn import production của legacy coordinator sau migration.

**Dependencies:** Tasks 2-3

**Files likely touched:**

- `src/search/SearchService.ts`
- `src/search/engine/SearchCoordinator.ts`
- `src/search/ui/SearchQuickPick.ts`
- `src/search/benchmark/SearchBenchmark.ts`
- `src/vscode/commands.ts`

**Estimated scope:** Medium

## Checkpoint A: Functional search core

- [x] Files, Classes, Symbols và Text chạy end-to-end trên Extension Host fixture.
- [x] Compile/lint/format/test pass.
- [x] Review diff xác nhận không phá index persistence/warmup.

## Task 5: Optimize candidate lookup and ranking

**Description:** Thay full scan mỗi keystroke bằng candidate query/index phù hợp; chuẩn hóa score một lần và giữ exact-match guardrail.

**Acceptance criteria:**

- [x] File/symbol hot path không gọi `getAll*()` cho mỗi query.
- [x] Exact name luôn đứng trên fuzzy/recency result.
- [x] Lookup scale test có corpus 10k/100k records và memory report.

**Verification:**

- [x] Ranking corpus deterministic.
- [x] Benchmark đạt KPI trong `tasks/plan.md` hoặc ghi rõ regression/blocker.

**Dependencies:** Task 4

**Files likely touched:**

- `src/index/store/IndexStore.ts`
- `src/index/store/MemoryIndexStore.ts`
- `src/index/store/PersistentIndexStore.ts`
- `src/index/ProjectIndexService.ts`
- `src/search/ranking/RankingEngine.ts`

**Estimated scope:** Medium

## Task 6: Make sessions, cancellation, and cache effective

**Description:** Bảo đảm query mới hủy contributor cũ, cache có scope đúng nhưng không bị token làm vô hiệu, và prefix reuse thực sự nằm trên hot path.

**Acceptance criteria:**

- [x] Request cũ không update UI sau request mới.
- [x] Cancel kết thúc ripgrep/scheduler work mà không leak listener/process.
- [x] Cache key gồm workspace/mode/filter; repeated/prefix query có hit đo được.

**Verification:**

- [x] Rapid-typing fake-timer test.
- [x] Cancellation/process cleanup test.
- [x] Cache invalidation test khi index/file event thay đổi.

**Dependencies:** Tasks 4-5

**Files likely touched:**

- `src/search/SearchSession.ts`
- `src/search/SearchService.ts`
- `src/cache/SearchQueryCache.ts`
- `src/search/engine/RipgrepEngine.ts`
- `test/unit/search/SearchService.test.ts`

**Estimated scope:** Medium

## Task 7: Replace estimated metrics with real stage timings

**Description:** Instrument parse/candidate/rank/merge/first-result/total bằng timer thật và chuyển benchmark/diagnostics sang production path.

**Acceptance criteria:**

- [x] Không còn tỷ lệ thời gian giả định.
- [x] Có cache-hit, cancelled, degraded-mode và contributor latency.
- [x] Dashboard/log có thể phân biệt cold/warm search.

**Verification:**

- [x] Metrics unit test bằng fake clock.
- [x] Benchmark output ghi corpus và cold/warm state.

**Dependencies:** Tasks 4-6

**Files likely touched:**

- `src/search/diagnostics/SearchDiagnostics.ts`
- `src/search/SearchService.ts`
- `src/search/benchmark/SearchBenchmark.ts`
- `src/core/metrics/MetricTypes.ts`
- `test/unit/search/SearchDiagnostics.test.ts`

**Estimated scope:** Medium

## Checkpoint B: Performance core

- [x] Không full scan trên hot path.
- [x] Rapid typing/cancellation/cache tests pass.
- [x] KPI có số đo production path, không phải estimate.

## Task 8: Define secure Search Webview protocol and controller

**Description:** Tạo singleton panel/controller lazy-loaded và typed message contract cho query, mode, filters, result batches, preview, open và cancel.

**Acceptance criteria:**

- [x] Message payload được validate trước khi dùng.
- [x] CSP nonce nghiêm ngặt, không external scripts/styles.
- [x] Panel dispose sẽ cancel session và release listeners.

**Verification:**

- [x] Protocol validation tests cho valid/invalid payload.
- [x] Lifecycle test cho reuse/dispose panel.

**Dependencies:** Tasks 4 and 6

**Files likely touched:**

- `src/search/ui/SearchPanel.ts`
- `src/search/ui/SearchPanelProtocol.ts`
- `src/search/SearchController.ts`
- `src/extension.ts`
- `test/unit/search/SearchPanelProtocol.test.ts`

**Estimated scope:** Medium

## Task 9: Build Android Studio-style search shell

**Description:** Xây UI webview theme-aware với tabs, input, grouped/virtualized results, filter toolbar, preview region và footer shortcuts.

**Acceptance criteria:**

- [x] Tabs All/Classes/Files/Symbols/Text và command initial-mode hoạt động.
- [x] Full keyboard navigation, stable active item, visible focus và ARIA labels.
- [x] Render chỉ viewport + overscan; highlight query không dùng unsafe HTML.

**Verification:**

- [x] UI interaction tests cho tabs, keyboard, loading/empty/error.
- [x] Manual review dark/light/high-contrast và 100%/150% scale.

**Dependencies:** Task 8

**Files likely touched:**

- `src/search/ui/webview/search.html`
- `src/search/ui/webview/search.css`
- `src/search/ui/webview/search.ts`
- `src/search/ui/SearchPanel.ts`
- `esbuild.js`

**Estimated scope:** Medium

## Task 10: Integrate preview, recent items, and fallback UI

**Description:** Nối preview/cache/history/index readiness vào Search panel và chuyển Quick Pick fallback sang cùng controller/view-model.

**Acceptance criteria:**

- [x] Empty input hiển thị recent files/queries có thể mở được.
- [x] Preview đổi theo active result, highlight đúng dòng, không đọc toàn file.
- [x] Indexing/disabled/error/degraded state có message và action phù hợp.
- [x] Quick Pick fallback trả cùng result/order/location với panel.

**Verification:**

- [x] Preview cache/invalidation tests.
- [x] Quick Pick interaction test và panel parity test.

**Dependencies:** Tasks 8-9

**Files likely touched:**

- `src/search/preview/SearchPreviewService.ts`
- `src/search/history/SearchHistoryService.ts`
- `src/search/ui/SearchPanel.ts`
- `src/search/ui/SearchQuickPick.ts`
- `test/unit/search/SearchPreviewService.test.ts`

**Estimated scope:** Medium

## Checkpoint C: UX review

- [x] User reviews Android Studio-style layout and keyboard behavior.
- [x] Accessibility/theme states pass.
- [x] Quick Pick fallback remains functional.

## Task 11: Integrate commands and search settings

**Description:** Nối mọi command mode vào panel và thêm behavior settings có migration/default rõ ràng.

**Acceptance criteria:**

- [x] Search Everywhere/Class/File/Symbol/Text mở đúng scope trong cùng panel.
- [x] Settings có default/migration/documentation và reload không leak/recreate services.
- [x] Text-in-All, debounce, result limit, preview và fallback UI có config test.

**Verification:**

- [x] Command registration/config reload tests.
- [x] Manual config reload không recreate panel/service hoặc leak listener.

**Dependencies:** Tasks 9-10

**Files likely touched:**

- `package.json`
- `src/vscode/commands.ts`
- `src/vscode/config.ts`
- `src/search/ui/SearchPanel.ts`
- `README.md`

**Estimated scope:** Medium

## Task 12: Add opt-in Android Studio keymap

**Description:** Thêm preset Android Studio có thể bật/tắt bằng setting mà không sửa trực tiếp user `keybindings.json`.

**Acceptance criteria:**

- [x] `codePulse.search.keymap` mặc định `off`; preset `androidStudio` chỉ active qua conditional `when` clause.
- [x] Preset map macOS: `Cmd+O` Class, `Cmd+Shift+O` File, `Cmd+Option+O` Symbol, `Cmd+Shift+F` Text; Windows/Linux: `Ctrl+N`, `Ctrl+Shift+N`, `Ctrl+Alt+Shift+N`, `Ctrl+Shift+F` cho các mode tương ứng.
- [x] Tắt preset khôi phục shortcut trước đó; user custom binding vẫn ưu tiên và không bị sửa/xóa.

**Verification:**

- [x] Automated test cho điều kiện bật/tắt preset và command target theo platform.
- [x] Manual keybinding conflict/restore check Windows/macOS/Linux.
- [x] Command mở Keyboard Shortcuts filter đúng `@ext:codepulse`.

**Dependencies:** Task 11

**Files likely touched:**

- `package.json`
- `src/vscode/config.ts`
- `src/vscode/commands.ts`
- `test/unit/extension/keybindings.test.ts`

**Estimated scope:** Medium

## Task 13: Extension Host E2E and release gate

**Description:** Thêm smoke test trong Extension Host và chạy đầy đủ quality/performance gate trên workspace nhỏ và corpus lớn.

**Acceptance criteria:**

- [x] Activate -> index ready -> invoke -> query -> switch tab -> open result chạy thật.
- [x] URI/line/column, cancellation, panel disposal và index rebuild đều được cover.
- [x] KPI, memory và known limitations được ghi lại trước release.

**Verification:**

- [x] `npm.cmd run compile`
- [x] `npm.cmd run lint`
- [x] `npm.cmd run format`
- [x] `npm.cmd run format:check`
- [x] `npm.cmd test`
- [x] Extension Host smoke suite và benchmark suite pass.

**Dependencies:** Tasks 1-12

**Files likely touched:**

- `test/integration/search.e2e.test.ts`
- `test/performance/search.benchmark.test.ts`
- `package.json`
- `README.md`
- `CHANGELOG.md`

**Estimated scope:** Medium

## Checkpoint D: Ready for review

- [x] Tất cả acceptance criteria hoàn tất.
- [x] Không warning/lỗi compile, lint, format hoặc test.
- [x] Diff không chứa thay đổi ngoài search scope.
- [x] Release evidence có functional E2E + performance, không chỉ unit tests.
