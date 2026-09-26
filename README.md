# CodePulse ⚡

> **High-Performance Workspace Intelligence, Diagnostic Profiling, and Instant Code Navigation for VS Code.**

CodePulse diagnoses and eliminates navigation and search latencies in large workspaces (TypeScript, JavaScript, Dart/Flutter, and multi-language projects). It optimizes editor performance through predictive background warmup, local symbol indexing, and automated configuration tuning.

---

## ✨ Features

- **⚡ Instant Navigation & Definition (F12)**: Sub-millisecond jump-to-definition using local index caching with transparent fallback and background verification against native language servers.
- **🔍 Fast Search**: Lightning-fast text search powered by ripgrep with pure JavaScript fallback when untrusted or unavailable.
- **📊 Real-Time Performance Diagnostics**: Measure real-world latency percentiles (Min, P50, P75, P90, P95, Max) for Definition, References, Workspace Symbols, and File Search.
- **🛠️ Automated Workspace Optimizer**: Detect missing watcher excludes, unexcluded generated folders (e.g. `node_modules`, `.dart_tool`, `dist`), and provide safe one-click configuration diffs with instant undo.
- **🧠 Predictive Warmup & Dependency Graph**: Bi-directional import/export dependency graph coupled with navigation history to pre-warm files right before you open them.
- **🛡️ Enterprise Hardened & Secure**: Strict Content Security Policy (CSP), workspace trust awareness (disables process spawning in untrusted folders), error isolation boundaries, and automated database corruption self-healing.

---

## 🚀 Quick Start

1. Install CodePulse from VS Code Marketplace or load the `.vsix`.
2. Click the **CodePulse (⚡)** icon on the Activity Bar to open the interactive Dashboard.
3. Click **"Scan Workspace Diagnostics"** to detect indexing bottlenecks.
4. Click **"Run Benchmark"** to test language server latency (P50/P95).
5. Enjoy instant navigation and snappy editing!

---

## ⌨️ Commands

| Command | Title | Description |
| :--- | :--- | :--- |
| `codePulse.openDashboard` | **Open Dashboard** | Opens the CodePulse performance dashboard view |
| `codePulse.analyzeWorkspace` | **Analyze Workspace Diagnostics** | Scans folders for watcher bloat, unindexed generated files, and misconfigurations |
| `codePulse.runBenchmark` | **Run Latency Benchmark** | Executes multi-iteration latency tests across definition, references, symbols, or search |
| `codePulse.cancelBenchmark` | **Cancel Benchmark** | Aborts any actively executing latency benchmark |
| `codePulse.warmupProject` | **Warmup Project** | Manually triggers background warmup queue for high-priority project files |
| `codePulse.pauseWarmup` | **Pause Warmup** | Pauses background warmup worker tasks |
| `codePulse.resumeWarmup` | **Resume Warmup** | Resumes paused background warmup worker tasks |
| `codePulse.rebuildIndex` | **Rebuild Project Index** | Rebuilds the local symbol and dependency graph database from scratch |
| `codePulse.clearIndex` | **Clear Index** | Clears the local SQLite/JSON index cache |
| `codePulse.pauseIndexing` | **Pause Indexing** | Temporarily pauses symbol indexing |
| `codePulse.resumeIndexing` | **Resume Indexing** | Resumes background symbol indexing |
| `codePulse.quickSearch` | **Fast Quick Search** | Opens quick search dialog querying local index and ripgrep |
| `codePulse.fastDefinition` | **Fast Go to Definition** | Rapid definition jump using CodePulse local index + native hybrid mode |
| `codePulse.fastReferences` | **Fast Find References** | Rapid reference finder using local indexed references |

---

## ⚙️ Configuration

Tune CodePulse in your VS Code `settings.json`:

```json
{
  // General toggle
  "codePulse.enabled": true,
  "codePulse.logging.level": "info",

  // Workspace Diagnostics
  "codePulse.diagnostics.enabled": true,
  "codePulse.diagnostics.slowThresholdMs": 500,

  // Local Indexing
  "codePulse.index.enabled": true,
  "codePulse.index.generatedFiles": false,
  "codePulse.index.maxFileSizeBytes": 1048576,

  // Background Warmup
  "codePulse.warmup.enabled": true,
  "codePulse.warmup.onStartup": true,
  "codePulse.warmup.concurrency": 2,
  "codePulse.warmup.useGitChanges": true,
  "codePulse.warmup.useRecentFiles": true,

  // Navigation & Search
  "codePulse.search.useRipgrep": true,
  "codePulse.navigation.mode": "native", // "native" | "hybrid" | "codepulse"
  "codePulse.navigation.trackHistory": true
}
```

---

## 🔒 Security & Workspace Trust

CodePulse adheres to strict VS Code extension security standards:
- **Restricted Untrusted Workspaces**: In untrusted workspaces, external process spawning (`ripgrep`, `git`) is completely disabled. The extension switches to pure Node in-process file scanning and VS Code native APIs.
- **Strict Webview CSP**: The dashboard uses a hardened Content Security Policy without remote script sources, using randomized per-session nonces and HTML escaping.
- **Process Isolation**: External commands never use shell string interpolation; child processes are executed directly with typed argument arrays and killed upon disposal or cancellation.
- **Self-Healing Storage**: Corrupted or incomplete index files are automatically detected, backed up to `.corrupted.<timestamp>`, and safely rebuilt without crashing the editor host.

---

## 📄 License

CodePulse is open source software licensed under the [MIT License](LICENSE).
