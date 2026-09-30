# VS Turbo ⚡

> **High-Performance Workspace Intelligence, Diagnostic Profiling, and Instant Code Navigation for VS Code.**

VS Turbo diagnoses and eliminates navigation and search latencies in large workspaces (TypeScript, JavaScript, Dart/Flutter, and multi-language projects). It optimizes editor performance through predictive background warmup, local symbol indexing, and automated configuration tuning.

---

## ✨ Features

- **⚡ Instant Navigation & Definition (F12)**: Sub-millisecond jump-to-definition using local index caching with transparent fallback and background verification against native language servers.
- **🔍 Fast Search Everywhere**: Lightning-fast text and symbol search powered by ripgrep with pure JavaScript fallback when untrusted or unavailable. Supports JetBrains / Android Studio keymap presets (`Ctrl+O` / `Cmd+O` Search Everywhere).
- **📊 Real-Time Performance Diagnostics**: Measure real-world latency percentiles (Min, P50, P75, P90, P95, Max) for Definition, References, Workspace Symbols, and File Search.
- **🛠️ Automated Workspace Optimizer**: Detect missing watcher excludes, unexcluded generated folders (e.g. `node_modules`, `.dart_tool`, `dist`), and provide safe one-click configuration diffs with instant undo.
- **🧠 Predictive Warmup & Dependency Graph**: Bi-directional import/export dependency graph coupled with navigation history to pre-warm files right before you open them.
- **🛡️ Enterprise Hardened & Secure**: Strict Content Security Policy (CSP), workspace trust awareness (disables process spawning in untrusted folders), error isolation boundaries, and automated database corruption self-healing.

---

## 🚀 Quick Start

1. Install VS Turbo from VS Code Marketplace or load the `.vsix`.
2. Click the **VS Turbo (⚡)** icon on the Activity Bar to open the interactive Dashboard.
3. Click **"Scan Workspace Diagnostics"** to detect indexing bottlenecks.
4. Click **"Run Benchmark"** to test language server latency (P50/P95).
5. Enjoy instant navigation and snappy editing!

---

## ⌨️ Commands

| Command | Title | Description |
| :--- | :--- | :--- |
| `vsturbo.openDashboard` | **Open Dashboard** | Opens the VS Turbo performance dashboard view |
| `vsturbo.analyzeWorkspace` | **Analyze Workspace Diagnostics** | Scans folders for watcher bloat, unindexed generated files, and misconfigurations |
| `vsturbo.runBenchmark` | **Run Latency Benchmark** | Executes multi-iteration latency tests across definition, references, symbols, or search |
| `vsturbo.cancelBenchmark` | **Cancel Benchmark** | Aborts any actively executing latency benchmark |
| `vsturbo.warmupProject` | **Warmup Project** | Manually triggers background warmup queue for high-priority project files |
| `vsturbo.pauseWarmup` | **Pause Warmup** | Pauses background warmup worker tasks |
| `vsturbo.resumeWarmup` | **Resume Warmup** | Resumes paused background warmup worker tasks |
| `vsturbo.rebuildIndex` | **Rebuild Project Index** | Rebuilds the local symbol and dependency graph database from scratch |
| `vsturbo.clearIndex` | **Clear Index** | Clears the local SQLite/JSON index cache |
| `vsturbo.pauseIndexing` | **Pause Indexing** | Temporarily pauses symbol indexing |
| `vsturbo.resumeIndexing` | **Resume Indexing** | Resumes background symbol indexing |
| `vsturbo.quickSearch` | **Fast Quick Search** | Opens quick search dialog querying local index and ripgrep |
| `vsturbo.searchEverywhere` | **Search Everywhere** | Searches files, classes, symbols, and text from one IDE-style panel |
| `vsturbo.searchClass` | **Search Class** | Searches indexed classes and types |
| `vsturbo.searchFile` | **Search File** | Searches indexed files by name or path |
| `vsturbo.searchSymbol` | **Search Symbol** | Searches indexed workspace symbols |
| `vsturbo.searchText` | **Search Text** | Searches workspace text with the trusted ripgrep fallback policy |
| `vsturbo.configureSearchShortcuts` | **Configure Search Shortcuts** | Opens VS Code keybindings filtered to VS Turbo |
| `vsturbo.fastDefinition` | **Fast Go to Definition** | Rapid definition jump using VS Turbo local index + native hybrid mode |
| `vsturbo.fastReferences` | **Fast Find References** | Rapid reference finder using local indexed references |

---

## ⚙️ Configuration

Tune VS Turbo in your VS Code `settings.json` or directly from the VS Turbo Dashboard:

```json
{
  // General toggle
  "vsturbo.enabled": true,
  "vsturbo.logging.level": "info",

  // Workspace Diagnostics
  "vsturbo.diagnostics.enabled": true,
  "vsturbo.diagnostics.slowThresholdMs": 500,

  // Local Indexing
  "vsturbo.index.enabled": true,
  "vsturbo.index.generatedFiles": false,
  "vsturbo.index.maxFileSizeBytes": 1048576,

  // Background Warmup
  "vsturbo.warmup.enabled": true,
  "vsturbo.warmup.onStartup": true,
  "vsturbo.warmup.concurrency": 2,
  "vsturbo.warmup.useGitChanges": true,
  "vsturbo.warmup.useRecentFiles": true,

  // Navigation & Search
  "vsturbo.search.useRipgrep": true,
  "vsturbo.search.useNativeQuickPick": true,
  "vsturbo.search.dialogMode": "floatingDialog",
  "vsturbo.search.defaultMode": "all",
  "vsturbo.search.keymap": "androidStudio", // "off" | "androidStudio"
  "vsturbo.navigation.mode": "native", // "native" | "hybrid" | "vsturbo"
  "vsturbo.navigation.trackHistory": true
}
```

### Search Shortcuts

When `vsturbo.search.keymap` is set to `androidStudio` (default):

- **Search Everywhere**: `Ctrl+O` on Windows/Linux, `Cmd+O` on macOS
- **Class / Type**: `Ctrl+N` on Windows/Linux, `Cmd+O` on macOS
- **File**: `Ctrl+Shift+N` on Windows/Linux, `Cmd+Shift+O` on macOS
- **Symbol**: `Ctrl+Alt+Shift+N` on Windows/Linux, `Cmd+Alt+O` on macOS
- **Text**: `Ctrl+Shift+F` on Windows/Linux, `Cmd+Shift+F` on macOS

Run **VS Turbo: Configure Search Shortcuts** or use the Dashboard button to customize these bindings.

---

## 🔒 Security & Workspace Trust

VS Turbo adheres to strict VS Code extension security standards:
- **Restricted Untrusted Workspaces**: In untrusted workspaces, external process spawning (`ripgrep`, `git`) is completely disabled. The extension switches to pure Node in-process file scanning and VS Code native APIs.
- **Strict Webview CSP**: The dashboard uses a hardened Content Security Policy without remote script sources, using randomized per-session nonces and HTML escaping.
- **Process Isolation**: External commands never use shell string interpolation; child processes are executed directly with typed argument arrays and killed upon disposal or cancellation.
- **Self-Healing Storage**: Corrupted or incomplete index files are automatically detected, backed up to `.corrupted.<timestamp>`, and safely rebuilt without crashing the editor host.

---

## 📄 License

VS Turbo is open source software licensed under the MIT License included with the extension.
