import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { ReferencesQuickPick } from '../../../src/navigation/ui/ReferencesQuickPick';
import { ReferenceItem } from '../../../src/navigation/navigationTypes';

describe('ReferencesQuickPick', () => {
  it('displays quickpick with formatted labels and file separators', async () => {
    let capturedItems: any[] = [];
    const mockQuickPick: any = {
      title: '',
      placeholder: '',
      matchOnDescription: false,
      matchOnDetail: false,
      set items(val: any[]) {
        capturedItems = val;
      },
      get items() {
        return capturedItems;
      },
      onDidAccept: vi.fn(),
      onDidHide: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    };

    vi.spyOn(vscode.window, 'createQuickPick').mockReturnValue(mockQuickPick);

    const refs: ReferenceItem[] = [
      {
        uri: vscode.Uri.file('/workspace/lib/main.dart'),
        range: new vscode.Range(10, 4, 10, 15),
        status: 'confirmed',
        source: 'native',
        previewLine: '  void doWork() {',
      },
      {
        uri: vscode.Uri.file('/workspace/lib/main.dart'),
        range: new vscode.Range(20, 2, 20, 10),
        status: 'candidate',
        source: 'textSearch',
        previewLine: '  doWork();',
      },
      {
        uri: vscode.Uri.file('/workspace/lib/other.dart'),
        range: new vscode.Range(5, 0, 5, 8),
        status: 'candidate',
        source: 'textSearch',
        previewLine: 'doWork();',
      },
    ];

    await ReferencesQuickPick.show('doWork', refs);

    expect(mockQuickPick.show).toHaveBeenCalled();
    expect(mockQuickPick.title).toContain('References: doWork (3 found)');

    // Separators must be inserted for each file
    const separators = capturedItems.filter((i) => i.kind === vscode.QuickPickItemKind.Separator);
    expect(separators.length).toBe(2);

    // Items must display confirmed and candidate labels
    const confirmedItems = capturedItems.filter((i) => i.label?.includes('[Confirmed]'));
    const candidateItems = capturedItems.filter((i) => i.label?.includes('[Candidate]'));

    expect(confirmedItems.length).toBe(1);
    expect(candidateItems.length).toBe(2);
  });
});
