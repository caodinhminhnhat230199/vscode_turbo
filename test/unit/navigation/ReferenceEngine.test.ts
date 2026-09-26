import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import { ReferenceEngine } from '../../../src/navigation/ReferenceEngine';
import { ReferenceItem } from '../../../src/navigation/navigationTypes';

describe('ReferenceEngine', () => {
  const engine = ReferenceEngine.getInstance();

  it('merges confirmed and candidate references, upgrading matching candidates', () => {
    const fileUri = vscode.Uri.file('/workspace/lib/test.dart');

    const confirmed: ReferenceItem[] = [
      {
        uri: fileUri,
        range: new vscode.Range(10, 2, 10, 9),
        status: 'confirmed',
        source: 'native',
      },
    ];

    const candidates: ReferenceItem[] = [
      // Duplicate of confirmed item at (10, 2)
      {
        uri: fileUri,
        range: new vscode.Range(10, 2, 10, 9),
        status: 'candidate',
        source: 'textSearch',
        previewLine: '  myTest();',
      },
      // Distinct candidate item at (20, 4)
      {
        uri: fileUri,
        range: new vscode.Range(20, 4, 20, 11),
        status: 'candidate',
        source: 'textSearch',
        previewLine: '    myTest();',
      },
    ];

    const merged = engine.mergeAndDeduplicate(confirmed, candidates, fileUri);

    expect(merged).toHaveLength(2);

    // The item at line 10 must be 'confirmed'
    const itemLine10 = merged.find((m) => m.range.start.line === 10);
    expect(itemLine10?.status).toBe('confirmed');
    expect(itemLine10?.source).toBe('native');

    // The item at line 20 must remain 'candidate'
    const itemLine20 = merged.find((m) => m.range.start.line === 20);
    expect(itemLine20?.status).toBe('candidate');
    expect(itemLine20?.source).toBe('textSearch');
  });

  it('sorts references placing confirmed first, then active file, then line order', () => {
    const activeUri = vscode.Uri.file('/workspace/lib/active.dart');
    const otherUri = vscode.Uri.file('/workspace/lib/other.dart');

    const items: ReferenceItem[] = [
      {
        uri: otherUri,
        range: new vscode.Range(5, 0, 5, 5),
        status: 'candidate',
        source: 'textSearch',
      },
      {
        uri: otherUri,
        range: new vscode.Range(2, 0, 2, 5),
        status: 'confirmed',
        source: 'native',
      },
      {
        uri: activeUri,
        range: new vscode.Range(15, 0, 15, 5),
        status: 'confirmed',
        source: 'native',
      },
      {
        uri: activeUri,
        range: new vscode.Range(1, 0, 1, 5),
        status: 'candidate',
        source: 'textSearch',
      },
    ];

    const sorted = engine.mergeAndDeduplicate(
      items.filter((i) => i.status === 'confirmed'),
      items.filter((i) => i.status === 'candidate'),
      activeUri
    );

    expect(sorted).toHaveLength(4);
    // Confirmed items come before candidate items
    expect(sorted[0].status).toBe('confirmed');
    expect(sorted[1].status).toBe('confirmed');
    // Active file confirmed comes before other file confirmed
    expect(sorted[0].uri.fsPath).toBe(activeUri.fsPath);
    expect(sorted[1].uri.fsPath).toBe(otherUri.fsPath);
    // Candidates follow
    expect(sorted[2].status).toBe('candidate');
    expect(sorted[3].status).toBe('candidate');
  });
});
