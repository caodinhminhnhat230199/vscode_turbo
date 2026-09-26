# Changelog

All notable changes to the **CodePulse** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
