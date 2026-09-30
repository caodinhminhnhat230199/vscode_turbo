import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { SearchMode } from '../../core/interfaces/ISearchService';

export function getSearchWebviewContent(
  webview: vscode.Webview,
  initialMode: SearchMode = 'all'
): string {
  const nonce = crypto.randomBytes(18).toString('base64');
  const initialModeJson = JSON.stringify(initialMode);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Search Everywhere</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --muted: var(--vscode-descriptionForeground, #999);
      --surface: var(--vscode-input-background, #252526);
      --border: var(--vscode-panel-border, #3c3c3c);
      --focus: var(--vscode-focusBorder, #007fd4);
      --hover: var(--vscode-list-hoverBackground, #2a2d2e);
      --selected: var(--vscode-list-activeSelectionBackground, #094771);
      --selected-fg: var(--vscode-list-activeSelectionForeground, #fff);
      --mark: var(--vscode-editor-findMatchHighlightBackground, #ea5c0055);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; height: 100vh; overflow: hidden; background: var(--bg); color: var(--fg);
      font: var(--vscode-font-size, 13px)/1.4 var(--vscode-font-family, sans-serif);
      display: grid; grid-template-rows: auto 1fr auto;
    }
    button, input { font: inherit; }
    .header { padding: 10px 12px 8px; border-bottom: 1px solid var(--border); }
    .tabs { display: flex; gap: 3px; overflow-x: auto; margin-bottom: 8px; }
    .tab {
      border: 1px solid transparent; border-radius: 4px; padding: 4px 8px; white-space: nowrap;
      color: var(--muted); background: transparent; cursor: pointer;
    }
    .tab:hover { background: var(--hover); color: var(--fg); }
    .tab[aria-selected="true"] { color: var(--fg); background: var(--surface); border-color: var(--border); }
    .shortcut { margin-left: 5px; font-size: 10px; opacity: .7; }
    #query {
      width: 100%; border: 1px solid var(--border); border-radius: 4px; padding: 8px 10px;
      color: var(--vscode-input-foreground, var(--fg)); background: var(--surface); outline: none;
    }
    #query:focus, .filter:focus, button:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }
    .filters { display: grid; grid-template-columns: repeat(4, minmax(90px, 1fr)); gap: 6px; margin-top: 7px; }
    .filter { min-width: 0; padding: 4px 6px; color: var(--fg); background: var(--surface); border: 1px solid var(--border); border-radius: 3px; }
    .content { min-height: 0; display: grid; grid-template-columns: minmax(280px, 3fr) minmax(250px, 2fr); }
    #results { position: relative; min-height: 0; overflow-y: auto; border-right: 1px solid var(--border); outline: none; }
    #spacer { position: relative; min-height: 100%; }
    .result {
      position: absolute; left: 0; right: 0; height: 52px; padding: 7px 10px; overflow: hidden;
      cursor: default; border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    }
    .result:hover { background: var(--hover); }
    .result[aria-selected="true"] { background: var(--selected); color: var(--selected-fg); }
    .primary, .secondary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .primary { font-weight: 600; }
    .secondary { color: var(--muted); font-size: 12px; }
    .result[aria-selected="true"] .secondary { color: inherit; opacity: .8; }
    .category {
      display: inline-block; min-width: 52px; padding: 1px 6px; font-size: 10px; font-weight: 700;
      text-transform: uppercase; border-radius: 3px; margin-right: 6px; letter-spacing: 0.5px;
      text-align: center; vertical-align: middle;
    }
    .category.class { background: rgba(168, 85, 247, 0.22); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.45); }
    .category.file { background: rgba(59, 130, 246, 0.22); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.45); }
    .category.symbol { background: rgba(234, 179, 8, 0.22); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.45); }
    .category.text { background: rgba(16, 185, 129, 0.22); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.45); }
    mark { color: inherit; background: var(--mark); border-radius: 2px; font-weight: 700; }
    #preview { min-width: 0; overflow: auto; padding: 12px 14px; background: color-mix(in srgb, var(--surface) 35%, var(--bg)); }
    #previewTitle { font-weight: 600; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preview-line { display: grid; grid-template-columns: 44px 1fr; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; line-height: 1.6; white-space: pre; }
    .preview-line.current { background: rgba(0, 127, 212, 0.24); border-left: 3px solid var(--focus); padding-left: 2px; }
    .line-number { color: var(--vscode-editorLineNumber-foreground, #858585); text-align: right; padding-right: 12px; user-select: none; font-size: 11px; opacity: 0.8; }
    .empty { position: absolute; inset: 0; display: grid; place-content: center; color: var(--muted); text-align: center; padding: 24px; }
    .history { display: flex; flex-direction: column; align-items: stretch; gap: 2px; min-width: 280px; }
    .history button { border: 0; background: transparent; color: var(--fg); padding: 5px 8px; text-align: left; cursor: pointer; }
    .history button:hover { background: var(--hover); }
    .status { min-height: 24px; padding: 4px 10px; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; display: flex; justify-content: space-between; }
    @media (max-width: 700px) { .content { grid-template-columns: 1fr; } #preview { display: none; } #results { border-right: 0; } .filters { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
  <header class="header">
    <div class="tabs" role="tablist" aria-label="Search scope">
      <button class="tab" role="tab" data-mode="all">All <span class="shortcut">Ctrl+⇧+Alt+F / ⌘⇧⌥F</span></button>
      <button class="tab" role="tab" data-mode="class">Classes <span class="shortcut">Ctrl+N / ⌘O</span></button>
      <button class="tab" role="tab" data-mode="file">Files <span class="shortcut">Ctrl+⇧+N / ⌘⇧O</span></button>
      <button class="tab" role="tab" data-mode="symbol">Symbols <span class="shortcut">Ctrl+Alt+⇧+N / ⌘⌥O</span></button>
      <button class="tab" role="tab" data-mode="text">Text <span class="shortcut">Ctrl+⇧+F / ⌘⇧F</span></button>
    </div>
    <input id="query" type="search" autocomplete="off" spellcheck="false" aria-label="Search query" aria-controls="results" placeholder="Search everywhere">
    <div class="filters" aria-label="Search filters">
      <input class="filter" id="filterKind" aria-label="Filter by kind" placeholder="Kind">
      <input class="filter" id="filterPath" aria-label="Filter by path" placeholder="Path">
      <input class="filter" id="filterExt" aria-label="Filter by extension" placeholder="Extension">
      <input class="filter" id="filterLang" aria-label="Filter by language" placeholder="Language">
    </div>
  </header>
  <main class="content">
    <div id="results" role="listbox" aria-label="Search results" tabindex="-1"><div id="spacer"></div></div>
    <section id="preview" aria-live="polite"><div id="previewTitle">Preview</div><div id="previewBody"></div></section>
  </main>
  <footer class="status"><span id="readiness">Index: idle</span><span id="metrics">Type to search</span></footer>
  <script nonce="${nonce}">
    (function () {
      'use strict';
      const vscode = acquireVsCodeApi();
      const modes = ['all', 'class', 'file', 'symbol', 'text'];
      const rowHeight = 52;
      const overscan = 6;
      const state = { mode: ${initialModeJson}, query: '', results: [], selected: -1, seq: 0, timer: 0, previewId: '', history: [] };
      const query = document.getElementById('query');
      const results = document.getElementById('results');
      const spacer = document.getElementById('spacer');
      const previewTitle = document.getElementById('previewTitle');
      const previewBody = document.getElementById('previewBody');
      const readiness = document.getElementById('readiness');
      const metrics = document.getElementById('metrics');
      const tabs = Array.from(document.querySelectorAll('.tab'));
      const filters = {
        kind: document.getElementById('filterKind'), path: document.getElementById('filterPath'),
        ext: document.getElementById('filterExt'), lang: document.getElementById('filterLang')
      };

      function clear(node) { node.replaceChildren(); }
      function text(node, value) { node.textContent = value == null ? '' : String(value); }
      function currentFilters() {
        const value = {};
        Object.keys(filters).forEach(function (key) {
          const clean = filters[key].value.trim();
          if (clean) value[key] = clean;
        });
        return value;
      }
      function setMode(mode, searchNow) {
        if (modes.indexOf(mode) < 0) return;
        state.mode = mode;
        tabs.forEach(function (tab) {
          const active = tab.dataset.mode === mode;
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
          tab.tabIndex = active ? 0 : -1;
        });
        query.placeholder = mode === 'all' ? 'Search everywhere' : 'Search ' + mode;
        if (searchNow) scheduleSearch(0);
      }
      function scheduleSearch(delay) {
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(runSearch, delay == null ? 80 : delay);
      }
      function runSearch() {
        state.query = query.value;
        if (!state.query.trim()) {
          state.results = [];
          state.selected = -1;
          renderHistory();
          vscode.postMessage({ type: 'getHistory' });
          return;
        }
        state.seq += 1;
        metrics.textContent = 'Searching…';
        vscode.postMessage({ type: 'search', query: state.query, mode: state.mode, seq: state.seq, filters: currentFilters() });
      }
      function appendHighlighted(parent, value, needle) {
        const source = String(value || '');
        const search = String(needle || '').toLocaleLowerCase();
        if (!search) { parent.appendChild(document.createTextNode(source)); return; }
        const lower = source.toLocaleLowerCase();
        let offset = 0;
        while (offset < source.length) {
          const index = lower.indexOf(search, offset);
          if (index < 0) { parent.appendChild(document.createTextNode(source.slice(offset))); break; }
          if (index > offset) parent.appendChild(document.createTextNode(source.slice(offset, index)));
          const mark = document.createElement('mark');
          mark.textContent = source.slice(index, index + search.length);
          parent.appendChild(mark);
          offset = index + search.length;
        }
      }
      function resultDetail(item) {
        const path = item.relativePath || item.fsPath || item.description || '';
        const location = typeof item.line === 'number' ? ':' + (item.line + 1) : '';
        return path + location;
      }
      function createResult(item, index) {
        const row = document.createElement('div');
        row.className = 'result';
        row.id = 'result-' + index;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', index === state.selected ? 'true' : 'false');
        row.style.top = String(index * rowHeight) + 'px';
        row.dataset.index = String(index);
        const primary = document.createElement('div');
        primary.className = 'primary';
        const category = document.createElement('span');
        category.className = 'category ' + (item.category || '');
        text(category, item.category);
        primary.appendChild(category);
        appendHighlighted(primary, item.label || item.name || item.fileName, state.query);
        const secondary = document.createElement('div');
        secondary.className = 'secondary';
        text(secondary, resultDetail(item));
        row.append(primary, secondary);
        row.addEventListener('mouseenter', function () { select(index, false); });
        row.addEventListener('click', function () { openSelected(false); });
        return row;
      }
      function renderResults() {
        clear(spacer);
        spacer.style.height = String(Math.max(results.clientHeight, state.results.length * rowHeight)) + 'px';
        if (!state.results.length) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          text(empty, state.query.trim() ? 'No matching results' : 'Start typing to search');
          spacer.appendChild(empty);
          query.removeAttribute('aria-activedescendant');
          return;
        }
        const start = Math.max(0, Math.floor(results.scrollTop / rowHeight) - overscan);
        const visible = Math.ceil(results.clientHeight / rowHeight) + overscan * 2;
        const end = Math.min(state.results.length, start + visible);
        for (let i = start; i < end; i += 1) spacer.appendChild(createResult(state.results[i], i));
        if (state.selected >= 0) query.setAttribute('aria-activedescendant', 'result-' + state.selected);
      }
      function renderHistory() {
        clear(spacer);
        spacer.style.height = '100%';
        if (!state.history.length) { renderResults(); return; }
        const wrapper = document.createElement('div');
        wrapper.className = 'history empty';
        const label = document.createElement('div');
        text(label, 'Recent searches');
        wrapper.appendChild(label);
        state.history.forEach(function (item) {
          const button = document.createElement('button');
          button.type = 'button';
          text(button, item);
          button.addEventListener('click', function () { query.value = item; scheduleSearch(0); query.focus(); });
          wrapper.appendChild(button);
        });
        spacer.appendChild(wrapper);
      }
      function select(index, ensureVisible) {
        if (!state.results.length) return;
        const nextSelected = Math.max(0, Math.min(index, state.results.length - 1));
        if (nextSelected === state.selected) return;
        state.selected = nextSelected;
        if (ensureVisible) {
          const top = state.selected * rowHeight;
          if (top < results.scrollTop) results.scrollTop = top;
          else if (top + rowHeight > results.scrollTop + results.clientHeight) results.scrollTop = top + rowHeight - results.clientHeight;
        }
        renderResults();
        requestPreview();
      }
      function requestPreview() {
        const item = state.results[state.selected];
        if (!item || item.id === state.previewId) return;
        state.previewId = item.id;
        text(previewTitle, item.label || item.name || item.fileName || 'Preview');
        clear(previewBody);
        text(previewBody, 'Loading preview…');
        vscode.postMessage({ type: 'requestPreview', id: item.id });
      }
      function openSelected(toSide) {
        const item = state.results[state.selected];
        if (item) vscode.postMessage({ type: 'openResult', id: item.id, toSide: Boolean(toSide) });
      }
      function renderPreview(snippet) {
        clear(previewBody);
        if (!snippet || !Array.isArray(snippet.lines)) { text(previewBody, 'Preview unavailable'); return; }
        text(previewTitle, snippet.filePath || 'Preview');
        snippet.lines.forEach(function (line, offset) {
          const number = snippet.startLine + offset;
          const row = document.createElement('div');
          row.className = 'preview-line' + (number === snippet.highlightLine ? ' current' : '');
          const lineNumber = document.createElement('span');
          lineNumber.className = 'line-number';
          text(lineNumber, number);
          const code = document.createElement('span');
          text(code, line);
          row.append(lineNumber, code);
          previewBody.appendChild(row);
        });
      }
      function cycleMode(delta) {
        const index = modes.indexOf(state.mode);
        setMode(modes[(index + delta + modes.length) % modes.length], true);
      }

      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () { setMode(tab.dataset.mode, true); query.focus(); });
      });
      query.addEventListener('input', function () { scheduleSearch(80); });
      Object.values(filters).forEach(function (filter) { filter.addEventListener('input', function () { scheduleSearch(120); }); });
      results.addEventListener('scroll', renderResults, { passive: true });
      window.addEventListener('resize', renderResults);
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { event.preventDefault(); vscode.postMessage({ type: 'dismiss' }); return; }
        if (event.target === query && event.key === 'Tab') { event.preventDefault(); cycleMode(event.shiftKey ? -1 : 1); return; }
        if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); cycleMode(event.key === 'ArrowLeft' ? -1 : 1); return; }
        if (event.key === 'ArrowDown' || (event.ctrlKey && event.key.toLowerCase() === 'j')) { event.preventDefault(); select(state.selected + 1, true); return; }
        if (event.key === 'ArrowUp' || (event.ctrlKey && event.key.toLowerCase() === 'k')) { event.preventDefault(); select(state.selected - 1, true); return; }
        if (event.key === 'Enter') { event.preventDefault(); openSelected(event.ctrlKey || event.metaKey); return; }
        if (event.altKey && event.key.toLowerCase() === 'p') { event.preventDefault(); requestPreview(); }
      });
      window.addEventListener('message', function (event) {
        const message = event.data;
        if (!message || typeof message.type !== 'string') return;
        if (message.type === 'setResults') {
          if (message.seq !== state.seq) return;
          state.results = Array.isArray(message.results) ? message.results : [];
          state.selected = state.results.length ? 0 : -1;
          state.previewId = '';
          metrics.textContent = String(message.total || 0) + ' results · ' + Number(message.executionMs || 0).toFixed(1) + ' ms';
          results.scrollTop = 0;
          renderResults();
          requestPreview();
        } else if (message.type === 'setPreview' && message.id === state.previewId) renderPreview(message.snippet);
        else if (message.type === 'setHistory') { state.history = Array.isArray(message.items) ? message.items : []; if (!query.value.trim()) renderHistory(); }
        else if (message.type === 'setReadiness') readiness.textContent = 'Index: ' + String(message.state || 'idle');
        else if (message.type === 'setMode') setMode(message.mode, false);
        else if (message.type === 'setError') { metrics.textContent = String(message.message || 'Search failed'); }
      });

      setMode(state.mode, false);
      renderResults();
      vscode.postMessage({ type: 'getHistory' });
      query.focus();
    }());
  </script>
</body>
</html>`;
}
