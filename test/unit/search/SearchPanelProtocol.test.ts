import { describe, expect, it } from 'vitest';
import { parseWebviewMessage } from '../../../src/search/ui/SearchPanelProtocol';

describe('SearchPanelProtocol', () => {
  it('accepts a bounded search message with allowlisted filters', () => {
    expect(
      parseWebviewMessage({
        type: 'search',
        query: 'UserService',
        mode: 'class',
        seq: 3,
        filters: { kind: 'class', path: 'src', ext: 'ts', lang: 'typescript' },
      })
    ).toEqual({
      type: 'search',
      query: 'UserService',
      mode: 'class',
      seq: 3,
      filters: { kind: 'class', path: 'src', ext: 'ts', lang: 'typescript' },
    });
  });

  it('rejects invalid modes, oversized queries, and preview paths supplied by the webview', () => {
    expect(
      parseWebviewMessage({ type: 'search', query: 'x', mode: 'git', seq: 1 })
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: 'search', query: 'x'.repeat(501), mode: 'all', seq: 1 })
    ).toBeUndefined();
    expect(
      parseWebviewMessage({
        type: 'requestPreview',
        id: 'result-1',
        filePath: 'C:\\Users\\secret.txt',
      })
    ).toBeUndefined();
  });

  it('accepts preview requests by result id only', () => {
    expect(parseWebviewMessage({ type: 'requestPreview', id: 'result-1' })).toEqual({
      type: 'requestPreview',
      id: 'result-1',
    });
  });
});
