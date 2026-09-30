# Implementation Plan: Search Recovery & Android Studio-style UX

## Tổng quan

Mục tiêu của đợt này là đưa Search của CodePulse từ trạng thái “unit test xanh nhưng luồng dùng thật không đáng tin cậy” thành một tính năng hoạt động end-to-end, sau đó mới nâng UI lên trải nghiệm gần Search Everywhere của Android Studio/JetBrains. Phạm vi tối ưu tập trung vào lifecycle/index, một pipeline search duy nhất, ranking/cancellation/cache trên hot path, UI keyboard-first, và benchmark đo đúng production path. Không refactor các module diagnostics/warmup/navigation không liên quan trực tiếp.

`plan_search.md` và `task_search.md` ở root được giữ nguyên như roadmap gốc. Tài liệu này là kế hoạch recovery có thứ tự ưu tiên và tiêu chí nghiệm thu cập nhật theo source hiện tại.

## Kết quả audit hiện tại

### Baseline

- `npm.cmd run compile`: pass.
- `npm.cmd run lint`: pass.
- `npm.cmd run format:check`: pass.
- `npm.cmd run test:unit`: 76 test files, 307 tests pass.
- Một lần chạy gate song song làm `activation.test.ts` fail vì test chỉ sleep 25 ms rồi kỳ vọng index đã có 1 file; chạy isolated và chạy lại toàn suite đều pass. Đây là bằng chứng race/readiness test đang flaky, không phải gate ổn định.
- Kết luận: lỗi nằm ở integration/runtime và UX; test hiện tại chưa chứng minh Search Everywhere hoạt động trong Extension Host thật.

### Root cause và khoảng trống đã xác định

1. **Search engine giữ stale store**: `SearchService`/`SearchCoordinator` được tạo lúc import module và các engine giữ `indexEngine.getStore()` khi nó còn là `MemoryIndexStore`. Sau đó `IndexEngine.configure()` thay store bằng `PersistentIndexStore`, nhưng engine search vẫn đọc store cũ. Hệ quả: file search rơi về fallback giới hạn 200 file; class/symbol có thể luôn rỗng dù index đã build.
2. **Hai pipeline song song**: `quickSearch` đi qua `SearchCoordinator` + `SearchQuickPick`, còn các command mới đi qua `SearchService` + `SearchEverywhereQuickPick`. Cancellation, ranking, line/column và benchmark vì thế không cùng một đường chạy.
3. **Index readiness không có contract**: command có thể mở khi index đang initialize/rebuild nhưng UI không hiển thị trạng thái, không chờ readiness và không có degraded-mode rõ ràng.
4. **Query parser chưa được nối đầy đủ**: `kind:`, `path:`, `ext:`, `lang:` được parse nhưng không đi xuống engine; `type:` chưa validate chặt.
5. **Metadata sai/lệch**: index đang lưu `relativePath` bằng basename, làm path search/ranking multi-root mất thông tin; symbol/text dùng tọa độ zero-based nhưng UI mới lại trừ thêm 1 khi mở file.
6. **UI chưa phải Search Everywhere**: `isModeTab`/`mode` được khai báo nhưng không dùng; không có tab thật, group header, filter, preview, empty/indexing/error state hay keyboard contract đầy đủ. `SearchPreviewService` chưa được nối vào UI.
7. **Hot path chưa tối ưu thật**: file/symbol engine gọi `getAllFiles()`/`getAllSymbols()` rồi scan toàn bộ cho mỗi lần gõ; cache UI gần như luôn bị vô hiệu vì request có workspace roots và cancellation token; prefix reuse chưa được dùng.
8. **Số liệu chưa phản ánh production path**: benchmark vẫn đo `SearchCoordinator` cũ; diagnostics chia thời gian parse/fetch/rank/merge bằng tỷ lệ giả định thay vì timer thực.
9. **Test gap**: chưa có test cho lifecycle `configure -> initialize -> search`, chưa có test interaction của `SearchEverywhereQuickPick`, chưa có Extension Host smoke test cho command -> UI -> chọn result -> đúng file/line.

## Design contract

### Hành vi lấy từ Android Studio/JetBrains

- Một entry point Search Everywhere, mặc định hiển thị recent items.
- Scope rõ ràng: All, Classes, Files, Symbols, Text; command riêng có thể mở thẳng scope.
- Chuyển scope bằng keyboard, điều hướng Up/Down, Enter để mở, Escape để đóng.
- Filter theo scope; kết quả có kind icon, tên chính, container/path và vị trí.
- Text results chỉ xuất hiện trong All khi query đủ dài hoặc các contributor chính có ít kết quả.
- Không nhảy/stale result khi contributor chậm trả về.

### Quyết định UI

- `codePulse.searchEverywhere` dùng **singleton WebviewPanel lazy-loaded** để có tab strip, highlight match, virtualized list và split preview đúng với roadmap UI hiện có.
- UI dùng VS Code theme tokens, CSP nghiêm ngặt, không tải framework/runtime ngoài; ưu tiên DOM TypeScript nhỏ để giảm activation và bundle cost.
- `SearchQuickPick` được giữ làm fallback native/low-resource và cho `codePulse.quickSearch`, nhưng dùng chung controller/service; không còn search stack riêng.
- VS Code không hỗ trợ extension tạo floating modal webview tùy ý. Vì vậy visual có thể mô phỏng dialog Search Everywhere trong editor panel, còn Quick Pick fallback giữ trải nghiệm popup native.

### Keymap contract

- Thêm setting `codePulse.search.keymap` với hai giá trị: `off` (mặc định) và `androidStudio`.
- Preset dùng `contributes.keybindings` kết hợp `when: config.codePulse.search.keymap == androidStudio`; không ghi đè trực tiếp `keybindings.json`. Khi tắt preset, VS Code tự khôi phục behavior/keybinding trước đó.
- Mapping Android Studio:

| Search mode | macOS | Windows/Linux |
|---|---|---|
| Class | `Cmd+O` | `Ctrl+N` |
| File | `Cmd+Shift+O` | `Ctrl+Shift+N` |
| Symbol | `Cmd+Option+O` | `Ctrl+Alt+Shift+N` |
| Text / Find in Path | `Cmd+Shift+F` | `Ctrl+Shift+F` |

- User keybindings vẫn có quyền ưu tiên. Có command mở Keyboard Shortcuts đã filter theo `@ext:codepulse` để người dùng tùy chỉnh thêm.
- Double-Shift không nằm trong preset vì VS Code contribution API không biểu diễn double-tap modifier như Android Studio; Search Everywhere vẫn có command riêng để người dùng tự gán shortcut phù hợp.

### Kiến trúc mục tiêu

```text
Commands / Search Webview / QuickPick fallback
                    |
              SearchController
                    |
               SearchService
      +-------------+-------------+
      |             |             |
 ProjectIndex   TextSearch    History/Cache
      |           (rg/API)         |
 current IndexStore provider       |
      +-------------+-------------+
                    |
        ranked, grouped, cancellable stream
```

## Thứ tự triển khai

### Phase 0 — Khóa bug bằng regression tests

1. Viết integration test tái hiện stale-store sau `IndexEngine.configure()` và test command/search trong khi index đang initialize; thay fixed sleep bằng readiness signal xác định.
2. Nâng VS Code mock đủ event của Quick Pick/Webview cần dùng để interaction test có ý nghĩa.
3. Tạo fixture có file, class, symbol và text result với expected URI/line/column.

Checkpoint: test mới phải đỏ đúng root cause trước khi sửa production code.

### Phase 1 — Làm Search hoạt động đúng end-to-end

1. Thay dependency `IndexStore` snapshot bằng `ProjectIndexService` hoặc store provider lấy store hiện tại tại thời điểm query.
2. Tạo readiness state rõ ràng: `idle/indexing/ready/error/disabled`; search không được âm thầm trả rỗng khi index chưa sẵn sàng.
3. Chuẩn hóa path theo workspace root và thống nhất zero-based position từ index đến `showTextDocument`.
4. Áp dụng toàn bộ parsed filters xuống query contract và validate filter value.
5. Hợp nhất `SearchCoordinator` vào `SearchService`; các command và benchmark đi qua cùng một production path.

Checkpoint: Files/Classes/Symbols/Text đều trả và mở đúng target trên fixture sau configure + initialize.

### Phase 2 — Tối ưu hot path và tính ổn định

1. Đưa file/symbol candidate lookup vào `ProjectIndexService`/`IndexStore`; tránh materialize toàn bộ records mỗi keystroke.
2. Dùng request generation + cancellation xuyên suốt scheduler, index contributors và ripgrep; kết quả cũ không được commit vào UI.
3. Đổi cache key thành workspace fingerprint + mode + normalized query + filters; token không làm cache mất hiệu lực. Dùng prefix candidates khi query nối dài.
4. Progressive contributor policy: file/class/symbol trước, text sau; debounce thích ứng thay vì một giá trị cố định cho mọi mode.
5. Đo thật từng stage và chuyển benchmark sang `SearchService`/`SearchController` production path.

Checkpoint: corpus benchmark đạt KPI và không có stale render/zombie process khi gõ nhanh.

### Phase 3 — Android Studio-style Search UI

1. Định nghĩa typed Webview protocol cho init, query, mode, filters, result batches, preview, open và cancel.
2. Xây shell UI theme-aware: header, tabs All/Classes/Files/Symbols/Text, input, toolbar filter, result list, preview pane, footer shortcut/status.
3. Keyboard-first: autofocus, Up/Down, Enter, Ctrl/Cmd+Enter, Escape, Tab/Shift+Tab; focus ring và ARIA đầy đủ.
4. Render theo window/virtual slice, highlight match an toàn, group result bằng contributor, giữ active selection ổn định khi batch mới đến.
5. Nối recent searches, indexing/error/empty state và snippet preview; preview dùng cache và không mở toàn file.
6. Giữ Quick Pick fallback dùng cùng data/view-model formatting; loại bỏ behavior lệch giữa hai UI.

Checkpoint: UI review ở theme sáng/tối/high-contrast và scale 100%/150%; thao tác hoàn toàn bằng keyboard.

### Phase 4 — Product integration và release gate

1. Command mỗi mode mở cùng Search panel với initial scope tương ứng.
2. Thêm preset keymap Android Studio dạng opt-in, reversible và có conflict tests; mặc định không hijack keybinding native.
3. Thêm settings cho text-in-All, debounce, result limit, preview và fallback UI; có migration/default rõ ràng.
4. Thêm diagnostics cho index readiness, contributor latency, cache hit, cancellation và degraded fallback.
5. Extension Host E2E smoke test: activate -> wait ready -> invoke command -> query -> switch tab -> open result -> verify editor location.
6. Chạy large-workspace benchmark, memory/activation measurement và regression gate bắt buộc.

Checkpoint: đủ release evidence, không chỉ unit test xanh.

## KPI và tiêu chí hoàn tất

| Hạng mục | Target |
|---|---:|
| Search panel mở, input focus | P95 < 100 ms, không tính lần tạo webview đầu tiên |
| Warm file search | P50 < 10 ms, P95 < 30 ms |
| Warm class/symbol search | P50 < 20 ms, P95 < 50 ms |
| First useful result trong All | P95 < 100 ms |
| Text first hit | P95 < 250 ms trên fixture/corpus chuẩn |
| Query cancellation | Không render request cũ sau request mới |
| Navigation | Đúng URI và zero-based line/column |
| UI | Không freeze khi 10k results; DOM chỉ giữ viewport + overscan |
| Quality gate | compile, lint, format:check và toàn bộ test pass |

KPI phải được ghi kèm corpus, số file/symbol, máy đo và cold/warm state; không dùng số liệu ước lượng trong diagnostics.

## Rủi ro và giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Webview không phải floating popup như Android Studio | Cao | Dùng dialog-style panel cho visual parity; giữ Quick Pick native làm popup fallback |
| Fix store lifecycle ảnh hưởng index persistence | Cao | Regression test store identity + restore + reconfigure trước khi sửa |
| Hai search stack tiếp tục drift | Cao | Một controller/service; benchmark và cả hai UI chỉ consume cùng contract |
| Text search làm All bị chậm | Trung bình | Delay contributor text, threshold query, stream riêng và cancel mạnh |
| Virtual list/focus gây lỗi accessibility | Trung bình | Roving tabindex/aria-activedescendant, screen-reader và high-contrast tests |
| Dirty worktree chứa thay đổi đang dở | Cao | Patch nhỏ, không rewrite file ngoài scope, review diff trước mỗi checkpoint |
| Preset Android Studio xung đột keybinding VS Code/user | Cao | Mặc định `off`, dùng conditional contribution, user binding ưu tiên và test bật/tắt/restore |

## Ngoài phạm vi đợt này

- Semantic/AI search.
- Search actions/settings/plugins giống đầy đủ JetBrains.
- Full-text persistent inverted index.
- Double-Shift modifier-only shortcut; VS Code không hỗ trợ contribution tương đương Android Studio.
- Tự động sửa hoặc xóa keybinding tùy chỉnh của người dùng; preset chỉ hoạt động khi người dùng opt-in.
- Refactor dashboard, warmup hay navigation nếu không cần cho search lifecycle.

## Nguồn tham chiếu

- Android Studio keyboard/search behavior: https://developer.android.com/studio/intro/keyboard-shortcuts
- Android Studio UI/search entry point: https://developer.android.com/studio/intro/user-interface
- JetBrains Search Everywhere behavior: https://www.jetbrains.com/help/idea/searching-everywhere.html
- VS Code Quick Pick UX/API: https://code.visualstudio.com/api/ux-guidelines/quick-picks
- VS Code Webview guidance: https://code.visualstudio.com/api/extension-guides/webview
