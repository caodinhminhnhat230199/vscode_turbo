import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { DashboardProvider } from '../../../src/webview/DashboardProvider';
import { Script } from 'vm';

describe('DashboardProvider webview security', () => {
  it('uses nonce-scoped styles and avoids HTML string injection sinks', () => {
    const provider = new DashboardProvider(vscode.Uri.file('/extension')) as any;
    const html = provider.getHtmlForWebview({ cspSource: 'vscode-webview:' });

    expect(html).not.toContain("'unsafe-inline'");
    expect(html).toMatch(/<style nonce="[A-Za-z0-9]+">/);
    expect(html).not.toContain('innerHTML');

    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(() => new Script(script)).not.toThrow();
  });

  it('renders Settings tab and contains all core configuration controls', () => {
    const provider = new DashboardProvider(vscode.Uri.file('/extension')) as any;
    const html = provider.getHtmlForWebview({ cspSource: 'vscode-webview:' });

    expect(html).toContain('data-tab="settings"');
    expect(html).toContain('id="tab-settings"');
    expect(html).toContain('id="setting-search-keymap"');
    expect(html).toContain('id="setting-search-dialog-mode"');
    expect(html).toContain('id="setting-search-default-mode"');
    expect(html).toContain('id="setting-search-ripgrep"');
    expect(html).toContain('id="setting-search-native-quickpick"');
    expect(html).toContain('id="setting-nav-mode"');
    expect(html).toContain('id="setting-index-enabled"');
    expect(html).toContain('id="setting-warmup-startup"');
    expect(html).toContain('id="btn-open-settings-ext"');
    expect(html).toContain('id="btn-open-keybindings-ext"');
  });

  it('renders Approve All button and tactile feedback action toast elements', () => {
    const provider = new DashboardProvider(vscode.Uri.file('/extension')) as any;
    const html = provider.getHtmlForWebview({ cspSource: 'vscode-webview:' });

    expect(html).toContain('id="btn-approve-all-recs"');
    expect(html).toContain('id="btn-undo-last-rec"');
    expect(html).toContain('id="action-toast"');
    expect(html).toContain('id="tab-badge-overview"');
    expect(html).toContain('id="findings-count-pill"');
    expect(html).toContain('APPLY_ALL_RECOMMENDATIONS');
  });
});
