import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './WebviewProtocol';
import { WebviewMessageRouter } from './WebviewMessageRouter';
import { stateStore } from '../core/state/StateStore';
import { logger } from '../core/logging/Logger';
import { configService } from '../vscode/config';

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vsturbo.dashboardView';
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

      // Subscribe to config changes and push to webview
      const configSub = configService.onDidChangeConfig((config) => {
        this.postMessage({
          type: 'CONFIG_UPDATE',
          payload: config,
        });
      });
      this.disposables.push(configSub);

      // Push initial config to webview
      this.postMessage({
        type: 'CONFIG_UPDATE',
        payload: configService.getConfig(),
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VS Turbo Dashboard</title>
  <style nonce="${nonce}">
    :root {
      --card-bg: var(--vscode-editor-background);
      --card-border: var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --accent-fg: var(--vscode-button-foreground, #ffffff);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --error-fg: var(--vscode-errorForeground);
      --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      --code-font: var(--vscode-editor-font-family, Menlo, Monaco, "Courier New", monospace);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-family);
      font-size: 13px;
      color: var(--text-main);
      background-color: var(--card-bg);
      padding: 12px;
      line-height: 1.45;
      overflow-x: hidden;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--card-border);
    }
    h1 {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.2px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-logo {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
    }
    .badge {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 12px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.3px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
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

    /* Segmented Tab Navigation */
    nav {
      display: flex;
      gap: 3px;
      padding: 3px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      margin-bottom: 14px;
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 6px 11px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      -webkit-user-select: none;
    }
    .tab-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-main);
    }
    .tab-btn:active {
      transform: scale(0.96) translateY(1px);
    }
    .tab-btn.active {
      background: var(--accent);
      color: var(--accent-fg);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
      font-weight: 600;
    }
    .tab-pill {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.2);
      font-weight: 700;
      line-height: 1.2;
    }
    .tab-pill.has-issues {
      background: #e51400;
      color: #fff;
    }

    /* Cards & Stats */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      position: relative;
    }
    .card h3 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 10px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .stat-item {
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 6px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .stat-item:hover {
      background: rgba(255, 255, 255, 0.045);
      border-color: rgba(255, 255, 255, 0.08);
    }
    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      font-weight: 600;
    }
    .stat-value {
      font-size: 17px;
      font-weight: 700;
      margin-top: 2px;
      font-family: var(--font-family);
    }
    .tag-container {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 10px;
    }
    .tag {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      font-weight: 500;
    }

    /* Buttons & Interactive Tactile Feedback */
    .btn {
      width: 100%;
      background: var(--accent);
      color: var(--accent-fg);
      border: 1px solid transparent;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      margin-top: 8px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
      transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      -webkit-user-select: none;
    }
    .btn:hover {
      background: var(--accent-hover);
      filter: brightness(1.05);
    }
    .btn:active {
      transform: scale(0.97) translateY(1px);
      filter: brightness(0.92);
    }
    .btn:focus-visible, .tab-btn:focus-visible, select:focus-visible, input:focus-visible {
      outline: 2px solid var(--vscode-focusBorder, var(--accent));
      outline-offset: 1px;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      box-shadow: none;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
    }
    .btn-sm {
      font-size: 11px;
      padding: 5px 10px;
      margin-top: 0;
      width: auto;
      display: inline-flex;
      font-weight: 500;
    }
    .btn-accent {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .btn-group {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .btn-group .btn { margin-top: 0; }
    .btn-group-compact { margin-top: 6px; }

    /* Tap Reaction & Loading State */
    .btn.is-busy {
      opacity: 0.85;
      pointer-events: none;
      cursor: wait;
    }
    .btn-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      vertical-align: -1px;
      flex-shrink: 0;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes tapPulse {
      0% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
      70% { box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
    }
    .is-tapped {
      animation: tapPulse 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Action Toast Banner */
    .action-toast {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      margin-bottom: 12px;
      background: rgba(0, 122, 204, 0.16);
      border: 1px solid rgba(0, 122, 204, 0.4);
      border-radius: 6px;
      color: var(--text-main);
      font-size: 11px;
      font-weight: 500;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .action-toast.toast-success {
      background: rgba(16, 124, 65, 0.18);
      border-color: rgba(16, 124, 65, 0.45);
      color: #89d185;
    }
    .action-toast.toast-warn {
      background: rgba(209, 135, 0, 0.18);
      border-color: rgba(209, 135, 0, 0.45);
      color: #f5c46b;
    }
    .toast-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 6px currentColor;
      animation: pulseDot 1.5s infinite;
      flex-shrink: 0;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.8); }
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Section Header & Action Groups */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      gap: 8px;
    }
    .section-title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title-wrap h3 {
      margin-bottom: 0;
    }
    .header-action-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .findings-pill {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      font-weight: 700;
    }
    .findings-pill-active {
      background: #e51400;
      color: #fff;
    }

    /* Findings Items */
    .empty-state {
      text-align: center;
      padding: 18px 8px;
      color: var(--text-muted);
      font-size: 12px;
    }
    .finding-item {
      padding: 11px;
      border-left: 3px solid var(--accent);
      background: rgba(255, 255, 255, 0.02);
      margin-bottom: 9px;
      border-radius: 6px;
      border: 1px solid var(--card-border);
      border-left-width: 3px;
      transition: background 0.15s ease, transform 0.15s ease, opacity 0.2s ease;
    }
    .finding-item:hover {
      background: rgba(255, 255, 255, 0.035);
    }
    .finding-item.critical, .finding-item.high { border-left-color: var(--error-fg); }
    .finding-item.medium { border-left-color: #d18700; }
    .finding-item.low { border-left-color: #007acc; }
    .finding-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .finding-title {
      font-weight: 600;
      font-size: 12px;
      letter-spacing: -0.1px;
    }
    .confidence-label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 500;
    }
    .finding-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
      line-height: 1.45;
    }
    .evidence-list {
      margin-top: 8px;
      padding: 7px 9px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 6px;
      font-size: 11px;
    }
    .evidence-item {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }
    .evidence-label {
      color: var(--text-muted);
    }
    .diff-preview {
      margin-top: 8px;
      padding: 7px 9px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      font-family: var(--code-font);
      font-size: 11px;
      border: 1px dashed var(--card-border);
      word-break: break-all;
    }
    .diff-del { color: var(--error-fg); }
    .diff-add { color: #89d185; }
    .finding-actions {
      display: flex;
      gap: 6px;
      margin-top: 9px;
    }
    .finding-actions .btn { margin-top: 0; }

    /* Benchmarks */
    select {
      width: 100%;
      background: var(--vscode-dropdown-background, var(--card-bg));
      color: var(--vscode-dropdown-foreground, var(--text-main));
      border: 1px solid var(--vscode-dropdown-border, var(--card-border));
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 8px;
      font-family: inherit;
    }
    table.bench-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 8px;
    }
    table.bench-table th, table.bench-table td {
      border: 1px solid var(--card-border);
      padding: 5px 6px;
      text-align: center;
    }
    table.bench-table th {
      background: rgba(255, 255, 255, 0.05);
      font-weight: 600;
      font-size: 10px;
      color: var(--text-muted);
    }
    .bench-delta {
      display: inline-block;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 6px;
    }
    .delta-improved { background: rgba(16, 124, 65, 0.2); color: #89d185; }
    .delta-regressed { background: rgba(229, 20, 0, 0.2); color: #f48771; }
    [hidden] { display: none !important; }
    .error-banner { padding: 10px; background: #e51400; color: #fff; border-radius: 6px; margin-bottom: 12px; font-size: 12px; }
    .benchmark-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .no-top-margin { margin-top: 0; }
    .benchmark-help, .field-label { font-size: 11px; color: var(--text-muted); }
    .benchmark-help { margin-bottom: 8px; }
    .field-group { margin-bottom: 6px; }
    .field-group-spaced { margin-bottom: 8px; }
    .field-label { display: block; margin-bottom: 3px; font-weight: 500; }
    .quick-grid { margin-top: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
    .stat-grid-three { grid-template-columns: repeat(3, 1fr); margin-bottom: 8px; }
    .stat-value-status { font-size: 13px; text-transform: capitalize; }
    .stat-value-small { font-size: 12px; }
    .current-file { margin-top: 10px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .monospace { font-family: var(--code-font); }
    .warmup-actions { margin-top: 14px; display: flex; gap: 8px; }
    .benchmark-item { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--card-border); }
    .benchmark-meta { font-size: 10px; color: var(--text-muted); margin-bottom: 6px; }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 4px;
    }
    .num-input {
      width: 100%;
      background: var(--vscode-input-background, var(--card-bg));
      color: var(--vscode-input-foreground, var(--text-main));
      border: 1px solid var(--vscode-input-border, var(--card-border));
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
      margin-top: 4px;
      margin-bottom: 8px;
    }
    .toast-saved {
      padding: 7px 11px;
      background: rgba(16, 124, 65, 0.2);
      color: #89d185;
      border: 1px solid rgba(16, 124, 65, 0.4);
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Accessibility: Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      *, ::before, ::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  </style>
</head>
<body>
  <div id="error-boundary-banner" class="error-banner" hidden></div>
  <div id="action-toast" class="action-toast" hidden>
    <span class="toast-indicator"></span>
    <span id="toast-message" class="toast-message"></span>
  </div>

  <header>
    <h1>
      <svg class="header-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 8.5 6 A 7 7 0 1 1 18 14" stroke="var(--accent)" opacity="0.6" />
        <path d="M 4 6 L 10.5 19 L 13.5 13" stroke="var(--accent)" stroke-width="2.2" />
        <path d="M 19 5 L 13 13 H 17 L 15 20" stroke="#f0883e" stroke-width="2.2" />
      </svg>
      VS Turbo <span class="badge" id="app-badge">Ready</span>
    </h1>
    <button class="tab-btn" id="btn-settings" title="Settings">⚙ Settings</button>
  </header>

  <nav>
    <button class="tab-btn active" data-tab="overview">
      <span>Overview</span>
      <span class="tab-pill" id="tab-badge-overview" hidden>0</span>
    </button>
    <button class="tab-btn" data-tab="diagnostics">Diagnostics</button>
    <button class="tab-btn" data-tab="index">Index</button>
    <button class="tab-btn" data-tab="warmup">Warmup</button>
    <button class="tab-btn" data-tab="settings">Settings</button>
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
      <div class="section-header">
        <div class="section-title-wrap">
          <h3>Workspace Findings & Recommendations</h3>
          <span class="findings-pill" id="findings-count-pill" hidden>0</span>
        </div>
        <div class="header-action-group">
          <button class="btn btn-sm btn-accent no-top-margin" id="btn-approve-all-recs" title="Approve and apply all actionable recommendations">⚡ Approve All</button>
          <button class="btn btn-secondary btn-sm no-top-margin" id="btn-undo-last-rec" title="Undo last applied recommendation">↩ Undo</button>
        </div>
      </div>
      <div id="findings-container">
        <div class="empty-state">No issues detected yet. Run scan.</div>
      </div>
    </div>
  </div>

  <!-- DIAGNOSTICS TAB -->
  <div id="tab-diagnostics" class="tab-content" hidden>
    <div class="card">
      <h3>Performance Benchmark</h3>
      <p class="benchmark-help">
        Measure latency of Definition, References, Symbols, and File Search.
      </p>
      <div class="field-group">
        <label class="field-label">Operation:</label>
        <select id="select-bench-op">
          <option value="definition">Definition (F12)</option>
          <option value="references">Find References</option>
          <option value="workspaceSymbols">Workspace Symbols</option>
          <option value="fileSearch">File Search</option>
        </select>
      </div>
      <div class="field-group-spaced">
        <label class="field-label">Iterations:</label>
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
      <div class="quick-grid">
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
  <div id="tab-index" class="tab-content" hidden>
    <div class="card">
      <h3>Index Status</h3>
      <div class="stat-grid stat-grid-three">
        <div class="stat-item">
          <div class="stat-label">State</div>
          <div class="stat-value stat-value-status" id="val-index-status">Idle</div>
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
          <div class="stat-value stat-value-small" id="val-index-dbsize">0 B</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Schema</div>
          <div class="stat-value stat-value-small" id="val-index-schema">v1</div>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn" id="btn-rebuild-idx">Rebuild</button>
        <button class="btn btn-secondary" id="btn-clear-idx">Clear</button>
      </div>
      <div class="btn-group btn-group-compact">
        <button class="btn btn-secondary btn-sm" id="btn-pause-idx">Pause</button>
        <button class="btn btn-secondary btn-sm" id="btn-resume-idx">Resume</button>
      </div>
    </div>
  </div>

  <!-- WARMUP TAB -->
  <div id="tab-warmup" class="tab-content" hidden>
    <div class="card">
      <h3>Warmup Engine</h3>
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">Status</div>
          <div class="stat-value stat-value-status" id="val-warmup-status">Idle</div>
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
          <div class="stat-value stat-value-small" id="val-warmup-reason">None</div>
        </div>
      </div>
      <div class="current-file">
        <span>Current File: </span><span id="val-warmup-file" class="monospace">None</span>
      </div>
      <div class="warmup-actions">
        <button class="btn" id="btn-start-warmup">Trigger Warmup</button>
        <button class="btn btn-secondary" id="btn-pause-warmup">Pause</button>
        <button class="btn btn-secondary" id="btn-resume-warmup">Resume</button>
      </div>
    </div>
  </div>

  <!-- SETTINGS TAB -->
  <div id="tab-settings" class="tab-content" hidden>
    <div id="settings-save-notice" class="toast-saved" hidden>✓ Setting updated</div>

    <!-- Search & Keymaps Card -->
    <div class="card">
      <h3>Search Everywhere & Keymaps</h3>
      <div class="field-group-spaced">
        <label class="field-label" for="setting-search-keymap">Keymap Preset (Android Studio / macOS / Windows):</label>
        <select id="setting-search-keymap">
          <option value="androidStudio">Android Studio (Cmd+O on macOS / Ctrl+O on Win, Ctrl+Shift+N, Ctrl+Alt+Shift+N, Ctrl+Shift+A)</option>
          <option value="off">Off (Default VS Code keybindings)</option>
        </select>
        <div class="benchmark-help">Overrides default VS Code open-file dialog with instant Search Everywhere.</div>
      </div>

      <div class="field-group-spaced">
        <label class="field-label" for="setting-search-dialog-mode">Presentation Mode:</label>
        <select id="setting-search-dialog-mode">
          <option value="floatingDialog">Floating Dialog (Android Studio modal top-center - Recommended)</option>
          <option value="editorTab">Editor Tab (Webview tab)</option>
        </select>
      </div>

      <div class="field-group-spaced">
        <label class="field-label" for="setting-search-default-mode">Default Search Mode:</label>
        <select id="setting-search-default-mode">
          <option value="all">All (Shift Shift)</option>
          <option value="class">Classes (Cmd+O / Ctrl+N)</option>
          <option value="file">Files (Cmd+Shift+O / Ctrl+Shift+N)</option>
          <option value="symbol">Symbols (Cmd+Alt+O / Ctrl+Alt+Shift+N)</option>
          <option value="text">Text (Cmd+Shift+F / Ctrl+Shift+F)</option>
        </select>
      </div>

      <div class="field-group">
        <label class="checkbox-label">
          <input type="checkbox" id="setting-search-ripgrep">
          <span>Use Ripgrep for fast text search</span>
        </label>
      </div>

      <div class="field-group">
        <label class="checkbox-label">
          <input type="checkbox" id="setting-search-native-quickpick">
          <span>Use native floating QuickPick dialog</span>
        </label>
      </div>
    </div>

    <!-- Navigation & Diagnostics Card -->
    <div class="card">
      <h3>Navigation & Diagnostics</h3>
      <div class="field-group-spaced">
        <label class="field-label" for="setting-nav-mode">Navigation Engine Mode:</label>
        <select id="setting-nav-mode">
          <option value="native">Native (Default VS Code LSP)</option>
          <option value="hybrid">Hybrid (Fast VS Turbo Index + LSP fallback)</option>
          <option value="vsturbo">VS Turbo (Direct Index First)</option>
        </select>
      </div>

      <div class="field-group">
        <label class="checkbox-label">
          <input type="checkbox" id="setting-nav-history">
          <span>Track navigation history for predictive warmup</span>
        </label>
      </div>

      <div class="field-group">
        <label class="checkbox-label">
          <input type="checkbox" id="setting-diag-enabled">
          <span>Enable workspace performance diagnostics</span>
        </label>
      </div>

      <div class="field-group-spaced">
        <label class="field-label" for="setting-diag-threshold">Slow Navigation Threshold (ms):</label>
        <input type="number" id="setting-diag-threshold" min="50" max="5000" step="50" class="num-input">
      </div>
    </div>

    <!-- Indexing & Background Warmup Card -->
    <div class="card">
      <h3>Indexing & Background Warmup</h3>
      <div class="field-group">
        <label class="checkbox-label">
          <input type="checkbox" id="setting-index-enabled">
          <span>Enable local symbol and file indexing</span>
        </label>
      </div>

      <div class="field-group">
        <label class="checkbox-label">
          <input type="checkbox" id="setting-index-generated">
          <span>Index generated/build output files</span>
        </label>
      </div>

      <div class="field-group">
        <label class="checkbox-label">
          <input type="checkbox" id="setting-warmup-startup">
          <span>Run warmup automatically on workspace startup</span>
        </label>
      </div>

      <div class="field-group-spaced">
        <label class="field-label" for="setting-warmup-concurrency">Warmup Concurrency:</label>
        <select id="setting-warmup-concurrency">
          <option value="1">1 file</option>
          <option value="2">2 files (Recommended)</option>
          <option value="4">4 files</option>
          <option value="8">8 files</option>
        </select>
      </div>
    </div>

    <!-- System & Logging Card -->
    <div class="card">
      <h3>System & Logging</h3>
      <div class="field-group">
        <label class="checkbox-label">
          <input type="checkbox" id="setting-enabled">
          <span>VS Turbo Extension Enabled</span>
        </label>
      </div>

      <div class="field-group-spaced">
        <label class="field-label" for="setting-log-level">Logging Level:</label>
        <select id="setting-log-level">
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>
    </div>

    <!-- Quick Shortcuts Card -->
    <div class="card">
      <h3>Quick Shortcuts</h3>
      <button class="btn btn-secondary" id="btn-open-settings-ext">Open in VS Code Settings Editor (@ext:vsturbo)</button>
      <button class="btn btn-secondary" id="btn-open-keybindings-ext">Configure Keyboard Shortcuts (@ext:vsturbo)</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Tactile & Feedback Helpers
    function flashTap(el) {
      if (!el) return;
      el.classList.remove('is-tapped');
      void el.offsetWidth;
      el.classList.add('is-tapped');
      setTimeout(() => el.classList.remove('is-tapped'), 350);
    }

    let actionToastTimer = null;
    function showToast(text, type, duration) {
      const toast = document.getElementById('action-toast');
      const msg = document.getElementById('toast-message');
      if (!toast || !msg) return;
      msg.textContent = text;
      toast.className = 'action-toast' + (type === 'success' ? ' toast-success' : type === 'warn' ? ' toast-warn' : '');
      toast.hidden = false;
      if (actionToastTimer) clearTimeout(actionToastTimer);
      actionToastTimer = setTimeout(() => {
        toast.hidden = true;
      }, duration || 3000);
    }

    const busyButtons = new Map();
    function setButtonBusy(btn, busyText, duration) {
      if (!btn) return;
      flashTap(btn);
      if (busyButtons.has(btn)) {
        clearTimeout(busyButtons.get(btn).timer);
      } else {
        busyButtons.set(btn, {
          originalText: btn.textContent,
          timer: null,
        });
      }
      btn.classList.add('is-busy');
      btn.replaceChildren();
      const spinner = document.createElement('span');
      spinner.className = 'btn-spinner';
      const label = document.createElement('span');
      label.textContent = ' ' + busyText;
      btn.append(spinner, label);

      const timer = setTimeout(() => {
        restoreButton(btn);
      }, duration || 3500);
      busyButtons.get(btn).timer = timer;
    }

    function restoreButton(btn) {
      if (!btn || !busyButtons.has(btn)) return;
      const data = busyButtons.get(btn);
      if (data.timer) clearTimeout(data.timer);
      btn.classList.remove('is-busy');
      btn.textContent = data.originalText;
      busyButtons.delete(btn);
    }

    function restoreAllBusyButtons() {
      busyButtons.forEach((_, btn) => restoreButton(btn));
    }

    window.addEventListener('error', function (e) {
      const banner = document.getElementById('error-boundary-banner');
      if (banner) {
        banner.hidden = false;
        banner.textContent = 'Dashboard Error: ' + (e.message || 'An error occurred.');
      }
    });

    window.addEventListener('unhandledrejection', function (e) {
      const banner = document.getElementById('error-boundary-banner');
      if (banner) {
        banner.hidden = false;
        banner.textContent = 'Dashboard Async Error: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
      }
    });

    function activateTab(tab) {
      document.querySelectorAll('nav .tab-btn').forEach(b => {
        if (b.getAttribute('data-tab') === tab) {
          b.classList.add('active');
          flashTap(b);
        } else {
          b.classList.remove('active');
        }
      });
      document.querySelectorAll('.tab-content').forEach(c => (c.hidden = true));
      const content = document.getElementById('tab-' + tab);
      if (content) content.hidden = false;
    }

    // Tab switching
    document.querySelectorAll('nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) activateTab(tab);
      });
    });

    document.getElementById('btn-settings')?.addEventListener('click', () => {
      activateTab('settings');
    });

    // Action buttons
    document.getElementById('btn-quick-scan')?.addEventListener('click', (e) => {
      setButtonBusy(e.currentTarget, 'Scanning Workspace...', 4000);
      showToast('⚡ Running workspace diagnostics...', 'info');
      vscode.postMessage({ type: 'RUN_DIAGNOSTICS' });
    });

    document.getElementById('btn-approve-all-recs')?.addEventListener('click', (e) => {
      setButtonBusy(e.currentTarget, 'Approving All...', 4000);
      showToast('⚡ Approving and applying all recommendations...', 'info');
      vscode.postMessage({ type: 'APPLY_ALL_RECOMMENDATIONS' });
    });

    document.getElementById('btn-undo-last-rec')?.addEventListener('click', (e) => {
      setButtonBusy(e.currentTarget, 'Undoing...', 2500);
      showToast('↩ Undoing last recommendation...', 'info');
      vscode.postMessage({ type: 'UNDO_RECOMMENDATION' });
    });

    document.getElementById('btn-run-benchmark')?.addEventListener('click', (e) => {
      const op = document.getElementById('select-bench-op')?.value || 'definition';
      const it = parseInt(document.getElementById('select-bench-iter')?.value || '5', 10);
      setButtonBusy(e.currentTarget, 'Benchmarking...', 4500);
      showToast('⚡ Running benchmark: ' + op + ' (' + it + ' iterations)...', 'info');
      vscode.postMessage({ type: 'RUN_BENCHMARK', payload: { operation: op, iterations: it } });
    });

    document.getElementById('btn-cancel-benchmark')?.addEventListener('click', (e) => {
      const op = document.getElementById('select-bench-op')?.value;
      flashTap(e.currentTarget);
      showToast('Benchmark cancelled.', 'warn');
      vscode.postMessage({ type: 'CANCEL_BENCHMARK', payload: { operation: op } });
    });

    function wireQuickBench(id, op, label) {
      document.getElementById(id)?.addEventListener('click', (e) => {
        setButtonBusy(e.currentTarget, 'Running...', 3500);
        showToast('⚡ Running quick benchmark: ' + label + '...', 'info');
        vscode.postMessage({ type: 'RUN_BENCHMARK', payload: { operation: op, iterations: 5 } });
      });
    }
    wireQuickBench('btn-quick-def', 'definition', 'Definition (F12)');
    wireQuickBench('btn-quick-ref', 'references', 'References');
    wireQuickBench('btn-quick-sym', 'workspaceSymbols', 'Symbols');
    wireQuickBench('btn-quick-search', 'fileSearch', 'File Search');

    document.getElementById('btn-rebuild-idx')?.addEventListener('click', (e) => {
      setButtonBusy(e.currentTarget, 'Rebuilding...', 5000);
      showToast('⚡ Rebuilding project index...', 'info');
      vscode.postMessage({ type: 'REBUILD_INDEX' });
    });

    document.getElementById('btn-clear-idx')?.addEventListener('click', (e) => {
      setButtonBusy(e.currentTarget, 'Clearing...', 3000);
      showToast('🗑️ Clearing project index...', 'warn');
      vscode.postMessage({ type: 'CLEAR_INDEX' });
    });

    document.getElementById('btn-pause-idx')?.addEventListener('click', (e) => {
      flashTap(e.currentTarget);
      showToast('Index paused.', 'warn');
      vscode.postMessage({ type: 'PAUSE_INDEX' });
    });

    document.getElementById('btn-resume-idx')?.addEventListener('click', (e) => {
      flashTap(e.currentTarget);
      showToast('Index resumed.', 'info');
      vscode.postMessage({ type: 'RESUME_INDEX' });
    });

    document.getElementById('btn-start-warmup')?.addEventListener('click', (e) => {
      setButtonBusy(e.currentTarget, 'Warming up...', 5000);
      showToast('🔥 Starting background project warmup...', 'info');
      vscode.postMessage({ type: 'START_WARMUP' });
    });

    document.getElementById('btn-pause-warmup')?.addEventListener('click', (e) => {
      flashTap(e.currentTarget);
      showToast('Warmup paused.', 'warn');
      vscode.postMessage({ type: 'PAUSE_WARMUP' });
    });

    document.getElementById('btn-resume-warmup')?.addEventListener('click', (e) => {
      flashTap(e.currentTarget);
      showToast('Warmup resumed.', 'info');
      vscode.postMessage({ type: 'RESUME_WARMUP' });
    });

    // Settings tab wiring
    let settingsNoticeTimer;
    function showSettingsNotice() {
      const notice = document.getElementById('settings-save-notice');
      if (notice) {
        notice.hidden = false;
        if (settingsNoticeTimer) clearTimeout(settingsNoticeTimer);
        settingsNoticeTimer = setTimeout(() => {
          notice.hidden = true;
        }, 2000);
      }
    }

    function setVal(id, val) {
      const el = document.getElementById(id);
      if (el) el.value = String(val);
    }

    function setChecked(id, val) {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(val);
    }

    function renderConfig(cfg) {
      if (!cfg) return;
      setVal('setting-search-keymap', cfg.searchKeymap || 'androidStudio');
      setVal('setting-search-dialog-mode', cfg.searchDialogMode || 'floatingDialog');
      setVal('setting-search-default-mode', cfg.searchDefaultMode || 'all');
      setChecked('setting-search-ripgrep', !!cfg.searchUseRipgrep);
      setChecked('setting-search-native-quickpick', !!cfg.searchUseNativeQuickPick);
      setVal('setting-nav-mode', cfg.navigationMode || 'native');
      setChecked('setting-nav-history', !!cfg.navigationTrackHistory);
      setChecked('setting-diag-enabled', !!cfg.diagnosticsEnabled);
      setVal('setting-diag-threshold', cfg.slowThresholdMs || 500);
      setChecked('setting-index-enabled', !!cfg.indexEnabled);
      setChecked('setting-index-generated', !!cfg.indexGeneratedFiles);
      setChecked('setting-warmup-startup', !!cfg.warmupOnStartup);
      setVal('setting-warmup-concurrency', cfg.warmupConcurrency || 2);
      setChecked('setting-enabled', !!cfg.enabled);
      setVal('setting-log-level', cfg.loggingLevel || 'info');
    }

    function wireSetting(id, key, isCheckbox, isNumber) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        let val;
        if (isCheckbox) {
          val = el.checked;
        } else if (isNumber) {
          val = parseInt(el.value, 10);
        } else {
          val = el.value;
        }
        vscode.postMessage({
          type: 'UPDATE_CONFIG',
          payload: { key: key, value: val }
        });
        showSettingsNotice();
      });
    }

    wireSetting('setting-search-keymap', 'vsturbo.search.keymap', false, false);
    wireSetting('setting-search-dialog-mode', 'vsturbo.search.dialogMode', false, false);
    wireSetting('setting-search-default-mode', 'vsturbo.search.defaultMode', false, false);
    wireSetting('setting-search-ripgrep', 'vsturbo.search.useRipgrep', true, false);
    wireSetting('setting-search-native-quickpick', 'vsturbo.search.useNativeQuickPick', true, false);
    wireSetting('setting-nav-mode', 'vsturbo.navigation.mode', false, false);
    wireSetting('setting-nav-history', 'vsturbo.navigation.trackHistory', true, false);
    wireSetting('setting-diag-enabled', 'vsturbo.diagnostics.enabled', true, false);
    wireSetting('setting-diag-threshold', 'vsturbo.diagnostics.slowThresholdMs', false, true);
    wireSetting('setting-index-enabled', 'vsturbo.index.enabled', true, false);
    wireSetting('setting-index-generated', 'vsturbo.index.generatedFiles', true, false);
    wireSetting('setting-warmup-startup', 'vsturbo.warmup.onStartup', true, false);
    wireSetting('setting-warmup-concurrency', 'vsturbo.warmup.concurrency', false, true);
    wireSetting('setting-enabled', 'vsturbo.enabled', true, false);
    wireSetting('setting-log-level', 'vsturbo.logging.level', false, false);

    document.getElementById('btn-open-settings-ext')?.addEventListener('click', (e) => {
      flashTap(e.currentTarget);
      showToast('Opening VS Code Settings...', 'info');
      vscode.postMessage({ type: 'OPEN_SETTINGS' });
    });
    document.getElementById('btn-open-keybindings-ext')?.addEventListener('click', (e) => {
      flashTap(e.currentTarget);
      showToast('Opening Keyboard Shortcuts...', 'info');
      vscode.postMessage({ type: 'OPEN_KEYBINDINGS' });
    });

    // Findings container CTA click delegation
    document.getElementById('findings-container')?.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.classList.contains('btn-apply-rec')) {
        const recId = target.getAttribute('data-rec-id');
        if (recId) {
          setButtonBusy(target, 'Applying...', 3000);
          showToast('⚡ Applying recommendation...', 'info');
          vscode.postMessage({ type: 'APPLY_RECOMMENDATION', payload: { recommendationId: recId } });
        }
      } else if (target && target.classList.contains('btn-ignore-finding')) {
        const findingId = target.getAttribute('data-finding-id');
        if (findingId) {
          setButtonBusy(target, 'Dismissing...', 1500);
          showToast('Finding dismissed.', 'warn');
          vscode.postMessage({ type: 'IGNORE_FINDING', payload: { findingId } });
        }
      }
    });

    // Listen for extension messages
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'STATE_UPDATE') {
        renderState(msg.payload);
      } else if (msg.type === 'CONFIG_UPDATE') {
        renderConfig(msg.payload);
      }
    });

    function renderState(state) {
      if (!state) return;
      try {
        restoreAllBusyButtons();

        const ws = state.workspace || {};
        document.getElementById('val-total-files').textContent = ws.totalFiles || 0;
        document.getElementById('val-source-files').textContent = ws.sourceFiles || 0;
        document.getElementById('val-generated-files').textContent = ws.generatedFiles || 0;
        document.getElementById('val-findings').textContent = (state.findings || []).length;

        // Project tags
        const tagContainer = document.getElementById('container-tags');
        if (tagContainer) {
          tagContainer.replaceChildren();
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

        // Actionable findings count & Approve All button update
        const actionableFindings = (state.findings || []).filter(
          f => f.recommendation && Array.isArray(f.recommendation.changes) && f.recommendation.changes.length > 0
        );
        const approveAllBtn = document.getElementById('btn-approve-all-recs');
        if (approveAllBtn) {
          if (actionableFindings.length > 0) {
            approveAllBtn.disabled = false;
            approveAllBtn.style.opacity = '1';
            approveAllBtn.style.pointerEvents = 'auto';
            approveAllBtn.textContent = '⚡ Approve All (' + actionableFindings.length + ')';
          } else {
            approveAllBtn.disabled = true;
            approveAllBtn.style.opacity = '0.45';
            approveAllBtn.style.pointerEvents = 'none';
            approveAllBtn.textContent = '⚡ Approve All';
          }
        }

        const totalFindings = (state.findings || []).length;
        const countPill = document.getElementById('findings-count-pill');
        if (countPill) {
          countPill.hidden = totalFindings === 0;
          countPill.textContent = String(totalFindings);
          countPill.className = totalFindings > 0 ? 'findings-pill findings-pill-active' : 'findings-pill';
        }

        const tabBadge = document.getElementById('tab-badge-overview');
        if (tabBadge) {
          tabBadge.hidden = totalFindings === 0;
          tabBadge.textContent = String(totalFindings);
          tabBadge.className = totalFindings > 0 ? 'tab-pill has-issues' : 'tab-pill';
        }

        const appBadge = document.getElementById('app-badge');
        if (appBadge) {
          if (state.indexStatus && state.indexStatus.status === 'indexing') {
            appBadge.textContent = 'Indexing...';
            appBadge.className = 'badge badge-medium';
          } else if (state.warmupStatus && state.warmupStatus.status === 'warming') {
            appBadge.textContent = 'Warming...';
            appBadge.className = 'badge badge-low';
          } else {
            appBadge.textContent = 'Ready';
            appBadge.className = 'badge';
          }
        }

        // Findings render
        const findingsContainer = document.getElementById('findings-container');
        if (findingsContainer) {
          if (!state.findings || state.findings.length === 0) {
            findingsContainer.replaceChildren(element('div', 'empty-state', 'No issues detected. Good job!'));
          } else {
            const findingNodes = state.findings.map(f => {
              const allowedSeverities = ['critical', 'high', 'medium', 'low', 'info'];
              const sev = allowedSeverities.includes(f.severity) ? f.severity : 'info';
              const item = element('div', 'finding-item ' + sev);
              const header = element('div', 'finding-header');
              header.append(
                element('span', 'badge badge-' + sev, sev),
                element('span', 'confidence-label', 'Confidence: ' + String(f.confidence || 'medium'))
              );
              item.append(header, element('div', 'finding-title', f.title), element('div', 'finding-desc', f.summary));

              if (Array.isArray(f.evidence) && f.evidence.length > 0) {
                const evidenceList = element('div', 'evidence-list');
                f.evidence.forEach(e => {
                  const row = element('div', 'evidence-item');
                  row.append(
                    element('span', 'evidence-label', String(e.label || '') + ':'),
                    element('span', '', String(e.value ?? '') + (e.unit ? ' ' + String(e.unit) : ''))
                  );
                  evidenceList.appendChild(row);
                });
                item.appendChild(evidenceList);
              }

              const changes = f.recommendation && Array.isArray(f.recommendation.changes)
                ? f.recommendation.changes : [];
              if (changes.length > 0) {
                const diff = element('div', 'diff-preview');
                changes.forEach(ch => {
                  const oldValue = typeof ch.oldValue === 'object' ? JSON.stringify(ch.oldValue) : String(ch.oldValue);
                  const newValue = typeof ch.newValue === 'object' ? JSON.stringify(ch.newValue) : String(ch.newValue);
                  const heading = element('div');
                  heading.appendChild(element('strong', '', ch.section));
                  diff.append(heading, element('div', 'diff-del', '- ' + oldValue), element('div', 'diff-add', '+ ' + newValue));
                });
                item.appendChild(diff);
              }

              const actions = element('div', 'finding-actions');
              if (changes.length > 0 && f.recommendation.id) {
                const apply = element('button', 'btn btn-sm btn-apply-rec', '⚡ Apply');
                apply.type = 'button';
                apply.dataset.recId = String(f.recommendation.id);
                actions.appendChild(apply);
              }
              const ignore = element('button', 'btn btn-sm btn-secondary btn-ignore-finding', 'Ignore');
              ignore.type = 'button';
              ignore.dataset.findingId = String(f.id || '');
              actions.appendChild(ignore);
              item.appendChild(actions);

              return item;
            });
            findingsContainer.replaceChildren(...findingNodes);
          }
        }

        // Benchmarks render
        const benchContainer = document.getElementById('bench-results-container');
        if (benchContainer) {
          if (!state.benchmarks || state.benchmarks.length === 0) {
            benchContainer.replaceChildren(element('div', 'empty-state', 'No benchmark data.'));
          } else {
            const opLastSeen = {};
            const benchmarkNodes = state.benchmarks.slice(0, 10).map(b => {
              const cat = b.category || (b.cold ? 'LANGUAGE_COLD_START' : 'OPTIMAL');
              const categories = {
                LANGUAGE_COLD_START: ['badge-cold', 'Cold Start'],
                LANGUAGE_PERSISTENT_SLOW: ['badge-slow', 'Slow'],
                PROVIDER_TIMEOUT: ['badge-timeout', 'Timeout'],
                NO_PROVIDER: ['badge-info', 'No Provider']
              };
              const badge = categories[cat] || ['badge-optimal', 'Optimal'];
              const item = element('div', 'benchmark-item');
              const header = element('div', 'benchmark-header');
              header.appendChild(element('strong', '', b.operation));
              const badges = element('div');

              const prev = opLastSeen[b.operation];
              opLastSeen[b.operation] = b;
              if (prev) {
                const diffMs = Number((metric(b.p50Ms) - metric(prev.p50Ms)).toFixed(1));
                if (diffMs !== 0) {
                  badges.appendChild(element(
                    'span',
                    'bench-delta ' + (diffMs < 0 ? 'delta-improved' : 'delta-regressed'),
                    (diffMs > 0 ? '+' : '') + diffMs + 'ms'
                  ));
                }
              }
              badges.appendChild(element('span', 'badge ' + badge[0], badge[1]));
              header.appendChild(badges);
              item.appendChild(header);
              const target = b.targetSymbol ? ' | Target: ' + String(b.targetSymbol) : '';
              item.appendChild(element('div', 'benchmark-meta', new Date(b.timestamp).toLocaleTimeString() + ' | Samples: ' + metric(b.sampleCount) + target));

              const table = element('table', 'bench-table');
              const tableHead = document.createElement('thead');
              const headRow = document.createElement('tr');
              ['Min', 'P50', 'P75', 'P90', 'P95', 'Max'].forEach(label => headRow.appendChild(element('th', '', label)));
              tableHead.appendChild(headRow);
              const tableBody = document.createElement('tbody');
              const valueRow = document.createElement('tr');
              ['minMs', 'p50Ms', 'p75Ms', 'p90Ms', 'p95Ms', 'maxMs'].forEach(key => {
                valueRow.appendChild(element('td', '', metric(b[key]) + 'ms'));
              });
              tableBody.appendChild(valueRow);
              table.append(tableHead, tableBody);
              item.appendChild(table);
              return item;
            });
            benchContainer.replaceChildren(...benchmarkNodes);
          }
        }
      } catch (err) {
        console.error('Failed to render dashboard state', err);
        const b = document.getElementById('error-boundary-banner');
        if (b) {
          b.hidden = false;
          b.textContent = 'Render error: ' + (err && err.message ? err.message : String(err));
        }
      }
    }

    function element(tag, className, value) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== undefined) node.textContent = String(value ?? '');
      return node;
    }

    function metric(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }

    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
      return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    }

    // Request initial state and config
    vscode.postMessage({ type: 'REQUEST_STATE' });
    vscode.postMessage({ type: 'REQUEST_CONFIG' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}
