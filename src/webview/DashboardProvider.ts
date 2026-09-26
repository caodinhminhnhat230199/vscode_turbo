import * as vscode from 'vscode';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './WebviewProtocol';
import { WebviewMessageRouter } from './WebviewMessageRouter';
import { stateStore } from '../core/state/StateStore';
import { logger } from '../core/logging/Logger';

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codepulse.dashboardView';
  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    try {
      this.view = webviewView;

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this.extensionUri],
      };

      webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

      // Subscribe to messages from webview
      const messageSub = webviewView.webview.onDidReceiveMessage(
        (message: WebviewToExtensionMessage) => {
          WebviewMessageRouter.handleMessage(message);
        }
      );
      this.disposables.push(messageSub);

      // Subscribe to state changes and push to webview
      const unsubscribeState = stateStore.subscribe((state) => {
        this.postMessage({
          type: 'STATE_UPDATE',
          payload: state,
        });
      });

      webviewView.onDidDispose(() => {
        unsubscribeState();
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
        this.view = undefined;
      });

      logger.debug('Dashboard webview resolved');
    } catch (err) {
      logger.error('Failed to resolve webview view', { error: String(err) });
    }
  }

  public postMessage(message: ExtensionToWebviewMessage): void {
    try {
      if (this.view) {
        this.view.webview.postMessage(message);
      }
    } catch (err) {
      logger.error('Failed to post message to webview', { error: String(err) });
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodePulse Dashboard</title>
  <style>
    :root {
      --card-bg: var(--vscode-editor-background);
      --card-border: var(--vscode-panel-border);
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --error-fg: var(--vscode-errorForeground);
      --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-family);
      font-size: 13px;
      color: var(--text-main);
      background-color: var(--card-bg);
      padding: 12px;
      line-height: 1.4;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--card-border);
    }
    h1 {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      text-transform: uppercase;
      font-weight: bold;
    }
    .badge-critical { background: #e51400; color: #fff; }
    .badge-high { background: #d83b01; color: #fff; }
    .badge-medium { background: #d18700; color: #fff; }
    .badge-low { background: #007acc; color: #fff; }
    .badge-info { background: var(--badge-bg); color: var(--badge-fg); }
    .badge-optimal { background: #107c41; color: #fff; }
    .badge-cold { background: #d18700; color: #fff; }
    .badge-slow { background: #e51400; color: #fff; }
    .badge-timeout { background: #a80000; color: #fff; }

    select {
      width: 100%;
      background: var(--vscode-dropdown-background, var(--card-bg));
      color: var(--vscode-dropdown-foreground, var(--text-main));
      border: 1px solid var(--vscode-dropdown-border, var(--card-border));
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 8px;
      font-family: inherit;
    }
    table.bench-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 6px;
    }
    table.bench-table th, table.bench-table td {
      border: 1px solid var(--card-border);
      padding: 4px 6px;
      text-align: center;
    }
    table.bench-table th {
      background: rgba(255, 255, 255, 0.05);
      font-weight: 600;
      font-size: 10px;
    }

    nav {
      display: flex;
      gap: 6px;
      margin-bottom: 14px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .tab-btn {
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }
    .tab-btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .card h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .stat-item {
      padding: 6px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 4px;
    }
    .stat-label {
      font-size: 11px;
      color: var(--text-muted);
    }
    .stat-value {
      font-size: 16px;
      font-weight: 600;
      margin-top: 2px;
    }
    .tag-container {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .tag {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
    }
    .btn {
      width: 100%;
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      margin-top: 6px;
      font-weight: 500;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--text-main);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .btn-sm {
      font-size: 11px;
      padding: 4px 8px;
      margin-top: 8px;
      width: auto;
      display: inline-block;
    }
    .btn-group {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .btn-group .btn { margin-top: 0; }
    .empty-state {
      text-align: center;
      padding: 16px 8px;
      color: var(--text-muted);
      font-size: 12px;
    }
    .finding-item {
      padding: 10px;
      border-left: 3px solid var(--accent);
      background: rgba(255, 255, 255, 0.02);
      margin-bottom: 8px;
      border-radius: 4px;
      border: 1px solid var(--card-border);
      border-left-width: 3px;
    }
    .finding-item.critical, .finding-item.high {
      border-left-color: var(--error-fg);
    }
    .finding-item.medium {
      border-left-color: #d18700;
    }
    .finding-item.low {
      border-left-color: #007acc;
    }
    .finding-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .finding-title {
      font-weight: 600;
      font-size: 12px;
    }
    .confidence-label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .finding-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
      line-height: 1.4;
    }
    .evidence-list {
      margin-top: 6px;
      padding: 6px;
      background: rgba(0, 0, 0, 0.15);
      border-radius: 4px;
      font-size: 11px;
    }
    .evidence-item {
      display: flex;
      justify-content: space-between;
      padding: 1px 0;
    }
    .evidence-label {
      color: var(--text-muted);
    }
    .diff-preview {
      margin-top: 6px;
      padding: 6px;
      background: rgba(0, 0, 0, 0.25);
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      border: 1px dashed var(--card-border);
      word-break: break-all;
    }
    .diff-del { color: var(--error-fg); }
    .diff-add { color: #89d185; }
    .finding-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .finding-actions .btn { margin-top: 0; }
    .bench-delta {
      display: inline-block;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 6px;
    }
    .delta-improved { background: rgba(16, 124, 65, 0.2); color: #89d185; }
    .delta-regressed { background: rgba(229, 20, 0, 0.2); color: #f48771; }
  </style>
</head>
<body>
  <div id="error-boundary-banner" style="display:none; padding:10px; background:#e51400; color:#fff; border-radius:4px; margin-bottom:12px; font-size:12px;"></div>
  <header>
    <h1>⚡ CodePulse <span class="badge" id="app-badge">Ready</span></h1>
    <button class="tab-btn" id="btn-settings" title="Settings">⚙</button>
  </header>

  <nav>
    <button class="tab-btn active" data-tab="overview">Overview</button>
    <button class="tab-btn" data-tab="diagnostics">Diagnostics</button>
    <button class="tab-btn" data-tab="index">Index</button>
    <button class="tab-btn" data-tab="warmup">Warmup</button>
  </nav>

  <!-- OVERVIEW TAB -->
  <div id="tab-overview" class="tab-content">
    <div class="card">
      <h3>Project Summary</h3>
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">Total Files</div>
          <div class="stat-value" id="val-total-files">0</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Source Files</div>
          <div class="stat-value" id="val-source-files">0</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Generated Files</div>
          <div class="stat-value" id="val-generated-files">0</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Issues Found</div>
          <div class="stat-value" id="val-findings">0</div>
        </div>
      </div>
      <div class="tag-container" id="container-tags"></div>
      <button class="btn" id="btn-quick-scan">Scan Workspace Diagnostics</button>
    </div>

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3>Workspace Findings & Recommendations</h3>
        <button class="btn btn-secondary btn-sm" id="btn-undo-last-rec" style="margin-top:0;">↩ Undo</button>
      </div>
      <div id="findings-container">
        <div class="empty-state">No issues detected yet. Run scan.</div>
      </div>
    </div>
  </div>

  <!-- DIAGNOSTICS TAB -->
  <div id="tab-diagnostics" class="tab-content" style="display:none;">
    <div class="card">
      <h3>Performance Benchmark</h3>
      <p style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">
        Measure latency of Definition, References, Symbols, and File Search.
      </p>
      <div style="margin-bottom:6px;">
        <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:2px;">Operation:</label>
        <select id="select-bench-op">
          <option value="definition">Definition (F12)</option>
          <option value="references">Find References</option>
          <option value="workspaceSymbols">Workspace Symbols</option>
          <option value="fileSearch">File Search</option>
        </select>
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:2px;">Iterations:</label>
        <select id="select-bench-iter">
          <option value="3">3 iterations</option>
          <option value="5" selected>5 iterations (Standard)</option>
          <option value="10">10 iterations (Thorough)</option>
        </select>
      </div>
      <div class="btn-group">
        <button class="btn" id="btn-run-benchmark">Run Benchmark</button>
        <button class="btn btn-secondary" id="btn-cancel-benchmark">Cancel</button>
      </div>
      <div style="margin-top:8px; display:grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
        <button class="btn btn-secondary btn-sm" id="btn-quick-def">Definition (F12)</button>
        <button class="btn btn-secondary btn-sm" id="btn-quick-ref">References</button>
        <button class="btn btn-secondary btn-sm" id="btn-quick-sym">Symbols</button>
        <button class="btn btn-secondary btn-sm" id="btn-quick-search">File Search</button>
      </div>
    </div>
    <div class="card">
      <h3>Benchmark Results</h3>
      <div id="bench-results-container">
        <div class="empty-state">No benchmark data.</div>
      </div>
    </div>
  </div>

  <!-- INDEX TAB -->
  <div id="tab-index" class="tab-content" style="display:none;">
    <div class="card">
      <h3>Index Status</h3>
      <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 8px;">
        <div class="stat-item">
          <div class="stat-label">State</div>
          <div class="stat-value" id="val-index-status" style="font-size:13px;">Idle</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Indexed Files</div>
          <div class="stat-value" id="val-index-files">0</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Indexed Symbols</div>
          <div class="stat-value" id="val-index-symbols">0</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Queue Size</div>
          <div class="stat-value" id="val-index-queue">0</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">DB Size</div>
          <div class="stat-value" id="val-index-dbsize" style="font-size:12px;">0 B</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Schema</div>
          <div class="stat-value" id="val-index-schema" style="font-size:12px;">v1</div>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn" id="btn-rebuild-idx">Rebuild</button>
        <button class="btn btn-secondary" id="btn-clear-idx">Clear</button>
      </div>
      <div class="btn-group" style="margin-top:6px;">
        <button class="btn btn-secondary btn-sm" id="btn-pause-idx">Pause</button>
        <button class="btn btn-secondary btn-sm" id="btn-resume-idx">Resume</button>
      </div>
    </div>
  </div>

  <!-- WARMUP TAB -->
  <div id="tab-warmup" class="tab-content" style="display:none;">
    <div class="card">
      <h3>Warmup Engine</h3>
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">Status</div>
          <div class="stat-value" id="val-warmup-status" style="font-size:13px; text-transform:capitalize;">Idle</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Queue Size</div>
          <div class="stat-value" id="val-warmup-queue">0</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Completed Tasks</div>
          <div class="stat-value" id="val-warmup-done">0</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Concurrency</div>
          <div class="stat-value" id="val-warmup-concurrency">2</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Elapsed Time</div>
          <div class="stat-value" id="val-warmup-elapsed">0s</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Pause Reason</div>
          <div class="stat-value" id="val-warmup-reason" style="font-size:12px;">None</div>
        </div>
      </div>
      <div style="margin-top:10px; font-size:12px; color:var(--vscode-descriptionForeground);">
        <span>Current File: </span><span id="val-warmup-file" style="font-family:monospace;">None</span>
      </div>
      <div style="margin-top:14px; display:flex; gap:8px;">
        <button class="btn" id="btn-start-warmup">Trigger Warmup</button>
        <button class="btn secondary" id="btn-pause-warmup">Pause</button>
        <button class="btn secondary" id="btn-resume-warmup">Resume</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    window.addEventListener('error', function (e) {
      const banner = document.getElementById('error-boundary-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.textContent = 'Dashboard Error: ' + (e.message || 'An error occurred.');
      }
    });

    window.addEventListener('unhandledrejection', function (e) {
      const banner = document.getElementById('error-boundary-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.textContent = 'Dashboard Async Error: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
      }
    });

    // Tab switching
    document.querySelectorAll('nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('nav .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        const content = document.getElementById('tab-' + tab);
        if (content) content.style.display = 'block';
      });
    });

    // Action buttons
    document.getElementById('btn-quick-scan')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'RUN_DIAGNOSTICS' });
    });
    document.getElementById('btn-run-benchmark')?.addEventListener('click', () => {
      const op = document.getElementById('select-bench-op')?.value || 'definition';
      const it = parseInt(document.getElementById('select-bench-iter')?.value || '5', 10);
      vscode.postMessage({ type: 'RUN_BENCHMARK', payload: { operation: op, iterations: it } });
    });
    document.getElementById('btn-cancel-benchmark')?.addEventListener('click', () => {
      const op = document.getElementById('select-bench-op')?.value;
      vscode.postMessage({ type: 'CANCEL_BENCHMARK', payload: { operation: op } });
    });
    document.getElementById('btn-quick-def')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'RUN_BENCHMARK', payload: { operation: 'definition', iterations: 5 } });
    });
    document.getElementById('btn-quick-ref')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'RUN_BENCHMARK', payload: { operation: 'references', iterations: 5 } });
    });
    document.getElementById('btn-quick-sym')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'RUN_BENCHMARK', payload: { operation: 'workspaceSymbols', iterations: 5 } });
    });
    document.getElementById('btn-quick-search')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'RUN_BENCHMARK', payload: { operation: 'fileSearch', iterations: 5 } });
    });
    document.getElementById('btn-rebuild-idx')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'REBUILD_INDEX' });
    });
    document.getElementById('btn-clear-idx')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'CLEAR_INDEX' });
    });
    document.getElementById('btn-pause-idx')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'PAUSE_INDEX' });
    });
    document.getElementById('btn-resume-idx')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'RESUME_INDEX' });
    });
    document.getElementById('btn-start-warmup')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'START_WARMUP' });
    });
    document.getElementById('btn-pause-warmup')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'PAUSE_WARMUP' });
    });
    document.getElementById('btn-resume-warmup')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'RESUME_WARMUP' });
    });
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'OPEN_SETTINGS' });
    });

    // Findings container CTA click delegation
    document.getElementById('findings-container')?.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.classList.contains('btn-apply-rec')) {
        const recId = target.getAttribute('data-rec-id');
        if (recId) {
          vscode.postMessage({ type: 'APPLY_RECOMMENDATION', payload: { recommendationId: recId } });
        }
      } else if (target && target.classList.contains('btn-ignore-finding')) {
        const findingId = target.getAttribute('data-finding-id');
        if (findingId) {
          vscode.postMessage({ type: 'IGNORE_FINDING', payload: { findingId } });
        }
      }
    });

    document.getElementById('btn-undo-last-rec')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'UNDO_RECOMMENDATION' });
    });

    // Listen for extension messages
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'STATE_UPDATE') {
        renderState(msg.payload);
      }
    });

    function renderState(state) {
      if (!state) return;
      try {
        const ws = state.workspace || {};
      document.getElementById('val-total-files').textContent = ws.totalFiles || 0;
      document.getElementById('val-source-files').textContent = ws.sourceFiles || 0;
      document.getElementById('val-generated-files').textContent = ws.generatedFiles || 0;
      document.getElementById('val-findings').textContent = (state.findings || []).length;

      // Project tags
      const tagContainer = document.getElementById('container-tags');
      if (tagContainer) {
        tagContainer.innerHTML = '';
        if (ws.languages) {
          Object.keys(ws.languages).forEach(lang => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.textContent = lang;
            tagContainer.appendChild(span);
          });
        }
        if (ws.frameworks) {
          ws.frameworks.forEach(fw => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.textContent = fw;
            tagContainer.appendChild(span);
          });
        }
      }

      const idx = state.indexStatus || {};
      document.getElementById('val-index-status').textContent = idx.status || 'idle';
      const elFiles = document.getElementById('val-index-files');
      if (elFiles) elFiles.textContent = idx.indexedFiles || 0;
      const elSymbols = document.getElementById('val-index-symbols');
      if (elSymbols) elSymbols.textContent = idx.symbolCount || 0;
      document.getElementById('val-index-queue').textContent = idx.queueSize || 0;
      const elDbSize = document.getElementById('val-index-dbsize');
      if (elDbSize) elDbSize.textContent = formatBytes(idx.dbSizeBytes || 0);
      const elSchema = document.getElementById('val-index-schema');
      if (elSchema) elSchema.textContent = 'v' + (idx.schemaVersion || 1);

      const warmup = state.warmupStatus || {};
      const elWarmupStatus = document.getElementById('val-warmup-status');
      if (elWarmupStatus) elWarmupStatus.textContent = warmup.status || 'idle';
      const elWarmupQueue = document.getElementById('val-warmup-queue');
      if (elWarmupQueue) elWarmupQueue.textContent = warmup.queueSize || 0;
      const elWarmupDone = document.getElementById('val-warmup-done');
      if (elWarmupDone) elWarmupDone.textContent = warmup.completedTasks || 0;
      const elWarmupConcurrency = document.getElementById('val-warmup-concurrency');
      if (elWarmupConcurrency) elWarmupConcurrency.textContent = warmup.concurrency || 2;
      const elWarmupElapsed = document.getElementById('val-warmup-elapsed');
      if (elWarmupElapsed) elWarmupElapsed.textContent = Math.round((warmup.elapsedTimeMs || 0) / 1000) + 's';
      const elWarmupReason = document.getElementById('val-warmup-reason');
      if (elWarmupReason) elWarmupReason.textContent = warmup.pauseReason || 'None';
      const elWarmupFile = document.getElementById('val-warmup-file');
      if (elWarmupFile) elWarmupFile.textContent = warmup.currentFile || 'None';

      // Findings render
      const findingsContainer = document.getElementById('findings-container');
      if (findingsContainer) {
        if (!state.findings || state.findings.length === 0) {
          findingsContainer.innerHTML = '<div class="empty-state">No issues detected. Good job!</div>';
        } else {
          findingsContainer.innerHTML = state.findings.map(f => {
            const sev = f.severity || 'info';
            const badgeClass = 'badge-' + sev;
            const evidenceHtml = f.evidence && f.evidence.length > 0
              ? '<div class="evidence-list">' +
                  f.evidence.map(e =>
                    '<div class="evidence-item">' +
                      '<span class="evidence-label">' + escapeHtml(e.label) + ':</span> ' +
                      '<span>' + escapeHtml(e.value) + (e.unit ? ' ' + escapeHtml(e.unit) : '') + '</span>' +
                    '</div>'
                  ).join('') +
                '</div>'
              : '';

            let diffHtml = '';
            if (f.recommendation && f.recommendation.changes && f.recommendation.changes.length > 0) {
              diffHtml = '<div class="diff-preview">' +
                f.recommendation.changes.map(ch => {
                  const oldStr = typeof ch.oldValue === 'object' ? JSON.stringify(ch.oldValue) : String(ch.oldValue);
                  const newStr = typeof ch.newValue === 'object' ? JSON.stringify(ch.newValue) : String(ch.newValue);
                  return '<div><strong>' + escapeHtml(ch.section) + '</strong></div>' +
                    '<div class="diff-del">- ' + escapeHtml(oldStr) + '</div>' +
                    '<div class="diff-add">+ ' + escapeHtml(newStr) + '</div>';
                }).join('') +
              '</div>';
            }

            const applyBtnHtml = f.recommendation && f.recommendation.changes && f.recommendation.changes.length > 0
              ? '<button class="btn btn-sm btn-apply-rec" data-rec-id="' + escapeHtml(f.recommendation.id) + '">' +
                  '⚡ Apply' +
                '</button>'
              : '';

            const ignoreBtnHtml = '<button class="btn btn-sm btn-secondary btn-ignore-finding" data-finding-id="' + escapeHtml(f.id) + '">Ignore</button>';

            return '<div class="finding-item ' + sev + '">' +
              '<div class="finding-header">' +
                '<span class="badge ' + badgeClass + '">' + sev + '</span>' +
                '<span class="confidence-label">Confidence: ' + (f.confidence || 'medium') + '</span>' +
              '</div>' +
              '<div class="finding-title">' + escapeHtml(f.title) + '</div>' +
              '<div class="finding-desc">' + escapeHtml(f.summary) + '</div>' +
              evidenceHtml +
              diffHtml +
              '<div class="finding-actions">' +
                applyBtnHtml +
                ignoreBtnHtml +
              '</div>' +
            '</div>';
          }).join('');
        }
      }

      // Benchmarks render
      const benchContainer = document.getElementById('bench-results-container');
      if (benchContainer) {
        if (!state.benchmarks || state.benchmarks.length === 0) {
          benchContainer.innerHTML = '<div class="empty-state">No benchmark data.</div>';
        } else {
          const opLastSeen = {};
          benchContainer.innerHTML = state.benchmarks.slice(0, 10).map(b => {
            const cat = b.category || (b.cold ? 'LANGUAGE_COLD_START' : 'OPTIMAL');
            let badgeClass = 'badge-optimal';
            let badgeText = 'Optimal';
            if (cat === 'LANGUAGE_COLD_START') {
              badgeClass = 'badge-cold';
              badgeText = 'Cold Start';
            } else if (cat === 'LANGUAGE_PERSISTENT_SLOW') {
              badgeClass = 'badge-slow';
              badgeText = 'Slow';
            } else if (cat === 'PROVIDER_TIMEOUT') {
              badgeClass = 'badge-timeout';
              badgeText = 'Timeout';
            } else if (cat === 'NO_PROVIDER') {
              badgeClass = 'badge-info';
              badgeText = 'No Provider';
            }

            const prev = opLastSeen[b.operation];
            opLastSeen[b.operation] = b;
            let deltaBadge = '';
            if (prev) {
              const diffMs = Number((b.p50Ms - prev.p50Ms).toFixed(1));
              if (diffMs < 0) {
                deltaBadge = '<span class="bench-delta delta-improved">' + diffMs + 'ms</span>';
              } else if (diffMs > 0) {
                deltaBadge = '<span class="bench-delta delta-regressed">+' + diffMs + 'ms</span>';
              }
            }

            return '<div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--card-border);">' +
              '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
                '<strong>' + escapeHtml(b.operation) + '</strong>' +
                '<div>' + deltaBadge + '<span class="badge ' + badgeClass + '">' + badgeText + '</span></div>' +
              '</div>' +
              '<div style="font-size:10px; color:var(--text-muted); margin-bottom:6px;">' +
                new Date(b.timestamp).toLocaleTimeString() + ' | Samples: ' + b.sampleCount +
                (b.targetSymbol ? ' | Target: ' + escapeHtml(b.targetSymbol) : '') +
              '</div>' +
              '<table class="bench-table">' +
                '<thead>' +
                  '<tr><th>Min</th><th>P50</th><th>P75</th><th>P90</th><th>P95</th><th>Max</th></tr>' +
                '</thead>' +
                '<tbody>' +
                  '<tr>' +
                    '<td>' + b.minMs + 'ms</td>' +
                    '<td><strong>' + b.p50Ms + 'ms</strong></td>' +
                    '<td>' + b.p75Ms + 'ms</td>' +
                    '<td>' + b.p90Ms + 'ms</td>' +
                    '<td>' + b.p95Ms + 'ms</td>' +
                    '<td>' + b.maxMs + 'ms</td>' +
                  '</tr>' +
                '</tbody>' +
              '</table>' +
            '</div>';
          }).join('');
        }
      }
    } catch (err) {
      console.error('Failed to render dashboard state', err);
      const b = document.getElementById('error-boundary-banner');
      if (b) {
        b.style.display = 'block';
        b.textContent = 'Render error: ' + (err && err.message ? err.message : String(err));
      }
    }
  }

    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
      return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    }

    // Request initial state
    vscode.postMessage({ type: 'REQUEST_STATE' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
