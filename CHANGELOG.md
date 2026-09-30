# Changelog

All notable changes to the **VS Turbo** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.3] - 2026-10-01

### Fixed
- Made **Approve All Recommendations** accept supported confirmation labels and refresh diagnostics only once after the batch completes.
- Preserved concurrent and nested dictionary settings with a three-way deep merge instead of overwriting unrelated configuration.
- Recorded the effective configuration target and live pre-apply value so Undo restores the correct Global or Workspace setting without removing newer changes.
- Updated dashboard findings immediately after recommendations are applied.
- Prevented stale Search Everywhere previews from opening after active-result changes, Escape, or result acceptance.
- Handled deleted, unreadable, binary, and oversized preview files without leaving the Search panel stuck in a loading state.

### Improved
- Added clearer category tags, icons, paths, line numbers, match highlighting, and selection styling to Search Everywhere results.
- Limited code previews to 20 lines and removed redundant mousemove/double-click rendering work in the Search webview.
- Expanded regression coverage for bulk apply, Undo, configuration scope, preview races, and preview file safety.

## [0.4.2] - 2026-09-28

### Added
- **Approve All Recommendations**: One-click batch approval button (`⚡ Approve All`) in Workspace Findings & Recommendations with confirmation prompt and detailed apply summary.
- **`vsturbo.applyAllRecommendations` Command**: New registered command and webview message routing to programmatically apply all actionable diagnostic recommendations.

### Improved
- **Taste-Skill Dashboard UI/UX Overhaul**:
  - Tactile micro-interactions on buttons, chips, and actions with haptic scale (`0.97`) and tap pulse.
  - Asynchronous busy/running state indicators with animated spinners and pointer-event debounce prevention.
  - Floating top toast notification system with slide-down animation and status indicator.
  - Segmented pill navigation tabs with dynamic counter badges.
  - Full accessibility compliance with `prefers-reduced-motion` and strict CSP nonce enforcement.

## [0.4.1] - 2026-09-28

### Changed
- Rebranded extension to **VS Turbo** (`vsturbo`).
- Synchronized all extension command IDs to `vsturbo.*` (with seamless backward-compatible aliases for legacy callers).
- Synchronized all configuration keys to `vsturbo.*` with automatic fallback to previous settings.
- Integrated full extension settings management directly into the interactive Dashboard view.
- Added default `Cmd+O` (macOS) and `Ctrl+O` (Windows/Linux) keymap override for Search Everywhere with instant toggle in Dashboard.
- Synchronized view container to `vsturbo-container` and dashboard view to `vsturbo.dashboardView`.
- Refreshed extension iconography and branding assets.

## [0.3.0] - 2026-09-27

### Added
- Android Studio-style Search Everywhere Webview dialog with tabbed navigation (All, Classes, Files, Symbols, Actions, Git).
- Live split-pane code preview with line context and highlight line.
- Full keyboard-first navigation (`↑`/`↓`, `Ctrl+J`/`Ctrl+K`, `Tab`/`Shift+Tab`, `Enter`, `Ctrl+Enter`, `Alt+P`, `Esc`).
- Opt-in Android Studio keymap preset (`codePulse.search.keymapPreset`) supporting `Ctrl+N` / `Cmd+O`, `Ctrl+Shift+N` / `Cmd+Shift+O`, `Ctrl+Alt+Shift+N` / `Cmd+Alt+O`, and `Ctrl+Shift+A` / `Cmd+Shift+A`.
- Filter-aware caching, prefix candidate reuse, and active session cancellation on rapid typing.
- Real stage timers (`parseMs`, `fetchMs`, `mergeMs`, `rankingMs`, `totalMs`) and diagnostics report.

### Fixed
- Fixed stale store references in singleton engines via dynamic index store provider.
- Subsequence-based candidate lookup eliminating full-table scans on 10k+ records.
- Guaranteed exact-match ranking dominance over recency bonuses.
- Handled already-cancelled tokens gracefully and ensured zero-based line/column navigation.
- Automatic fallback to native QuickPick when `codePulse.search.useNativeQuickPick` is enabled or in headless environments.

## [0.2.0] - 2026-09-27

### Added
- Search Everywhere, Class, File, Symbol, and Text commands backed by the shared project index, scheduler, ranking, history, preview, and diagnostics services.

### Fixed
- Publish all Search Everywhere commands in the extension manifest so they are available to users.
- Cancel stale interactive searches before they can update the Quick Pick UI.
- Prevent context-dependent search results from reusing an unscoped cache entry.
- Remove the duplicate index-rebuild command registration.
- Parse ripgrep results correctly when a Windows drive letter is present.
- Validate all Search webview messages and resolve preview paths from trusted extension state.
- Serialize webview URIs, use a strict nonce-based CSP, and avoid unsafe HTML rendering.
- Coalesce persistent index writes and propagate cancellation to running scheduler jobs.
- Keep Android Studio shortcuts opt-in through `codePulse.search.keymap`.

## [0.1.0] - 2026-09-26

### Added
- **Core Architecture & Telemetry**: Micro-benchmark engine, event bus, and state store.
- **Diagnostics & Optimizer**: Automatic detection of missing `files.watcherExclude` and `search.exclude`, with one-click safe diff apply and undo.
- **Performance Benchmarking**: Multi-sample percentile measurements (Min, P50, P75, P90, P95, Max) for Definition, References, Symbols, and Search.
- **Symbol & File Indexing**: Persistent storage engine with fingerprint verification, incremental file updates, and multi-language symbol extraction (TypeScript, JavaScript, Dart, generic).
- **Background Warmup Engine**: Priority queues (active editor, entrypoints, git modifications, recent files) with adaptive concurrency and typing-responsiveness throttles.
- **Sub-millisecond Search & Navigation**: Ripgrep-powered text search with safe in-process regex fallback; hybrid navigation reconciling local definitions against language servers.
- **Interactive Dashboard**: Modern VS Code webview featuring real-time health badges, performance charts, and direct optimization actions.
- **Predictive Warmup & Dependency Graph**: Bi-directional graph tracking import/export relationships and local navigation transitions.
- **Product Hardening & Enterprise Security**:
  - Full Workspace Trust compliance: disables process spawning in untrusted folders.
  - Strict Content Security Policy (CSP) with nonce-isolated webview execution.
  - Self-healing database recovery on index corruption.
  - Complete lifecycle disposal for watchers, background queues, and child processes.

### Fixed
- Initialize the shared index against workspace storage and honor the public indexing configuration.
- Index all eligible source files during rebuild and incremental synchronization instead of only diagnostic samples.
- Block Git integration before accessing the Git extension in untrusted workspaces.
- Exclude development-only metadata and source maps from the published VSIX.
