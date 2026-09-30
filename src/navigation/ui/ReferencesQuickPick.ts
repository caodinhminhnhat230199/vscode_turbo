import * as vscode from 'vscode';
import * as path from 'path';
import { ReferenceItem } from '../navigationTypes';

interface ReferenceQuickPickItem extends vscode.QuickPickItem {
  referenceItem?: ReferenceItem;
}

export class ReferencesQuickPick {
  public static async show(symbolName: string, references: ReferenceItem[]): Promise<void> {
    if (references.length === 0) {
      vscode.window.showInformationMessage(`VS Turbo: No references found for "${symbolName}".`);
      return;
    }

    const quickPick = vscode.window.createQuickPick<ReferenceQuickPickItem>();
    quickPick.title = `References: ${symbolName} (${references.length} found)`;
    quickPick.placeholder = 'Select a reference to open (type to filter by file or code snippet)';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    // Group references by file path
    const fileGroups = new Map<string, ReferenceItem[]>();
    for (const ref of references) {
      const fsPath = ref.uri.fsPath;
      if (!fileGroups.has(fsPath)) {
        fileGroups.set(fsPath, []);
      }
      fileGroups.get(fsPath)!.push(ref);
    }

    const items: ReferenceQuickPickItem[] = [];

    for (const [fsPath, groupRefs] of fileGroups.entries()) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
      const relativePath = workspaceFolder
        ? path.relative(workspaceFolder.uri.fsPath, fsPath)
        : path.basename(fsPath);

      // Separator for the file group
      items.push({
        label: relativePath,
        kind: vscode.QuickPickItemKind.Separator,
      });

      for (const ref of groupRefs) {
        const lineNum = ref.range.start.line + 1;
        const colNum = ref.range.start.character + 1;
        const statusBadge = ref.status === 'confirmed' ? '✓ [Confirmed]' : '⚡ [Candidate]';
        const preview = ref.previewLine?.trim() ?? `Line ${lineNum}`;

        items.push({
          label: `${statusBadge} Line ${lineNum}:${colNum}`,
          description: preview,
          detail: `File: ${relativePath} | Source: ${ref.source}`,
          referenceItem: ref,
        });
      }
    }

    quickPick.items = items;

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      if (selected?.referenceItem) {
        const ref = selected.referenceItem;
        quickPick.hide();
        await vscode.window.showTextDocument(ref.uri, {
          selection: ref.range,
        });
      }
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
    });

    quickPick.show();
  }
}
