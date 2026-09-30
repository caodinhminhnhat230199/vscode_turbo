import * as fs from 'fs';

export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string,
    public readonly fsPath: string
  ) {}

  static file(fsPath: string): Uri {
    const normalized = fsPath.replace(/\\/g, '/');
    return new Uri('file', '', normalized, '', '', fsPath);
  }

  static parse(uriString: string): Uri {
    const parts = uriString.split('://');
    const scheme = parts[0] || 'file';
    const rest = parts[1] || '';
    return new Uri(scheme, '', rest, '', '', rest);
  }

  with(change: {
    scheme?: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
      this.fsPath
    );
  }

  toJSON(): any {
    return {
      scheme: this.scheme,
      authority: this.authority,
      path: this.path,
      query: this.query,
      fragment: this.fragment,
      fsPath: this.fsPath,
    };
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath.replace(/\\/g, '/')}`;
  }
}

type Listener<T> = (e: T) => any;

export class EventEmitter<T> {
  private listeners: Listener<T>[] = [];
  event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) {
          this.listeners.splice(idx, 1);
        }
      },
    };
  };
  fire(data: T): void {
    [...this.listeners].forEach((l) => l(data));
  }
  dispose(): void {
    this.listeners = [];
  }
}

const onDidChangeWorkspaceFoldersEmitter = new EventEmitter<any>();
const onDidChangeActiveTextEditorEmitter = new EventEmitter<any>();
const onDidChangeTextDocumentEmitter = new EventEmitter<any>();
const onDidChangeTextEditorSelectionEmitter = new EventEmitter<any>();
const onDidChangeWindowStateEmitter = new EventEmitter<any>();

export interface MockWorkspaceFolder {
  uri: Uri;
  name: string;
  index: number;
}

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    show: () => {},
    dispose: () => {},
  }),
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: '',
    tooltip: '',
    command: '',
    backgroundColor: undefined,
  }),
  registerWebviewViewProvider: () => ({
    dispose: () => {},
  }),
  showInformationMessage: async () => {},
  showWarningMessage: async () => {},
  showErrorMessage: async () => {},
  showTextDocument: async (docOrUri: any, options?: any) => {
    const doc = docOrUri && docOrUri.uri ? docOrUri : { uri: docOrUri };
    const editor = {
      document: doc,
      selection: options?.selection ?? new Range(0, 0, 0, 0),
      revealRange: (_range: any, _type?: any) => {},
    };
    window.activeTextEditor = editor as any;
    return editor;
  },
  createQuickPick: <T extends any = any>() => {
    let items: T[] = [];
    let selectedItems: T[] = [];
    let value = '';
    let busy = false;
    let visible = false;
    let title = '';
    let buttons: any[] = [];
    const acceptEmitter = new EventEmitter<void>();
    const hideEmitter = new EventEmitter<void>();
    const changeValueEmitter = new EventEmitter<string>();
    const changeSelectionEmitter = new EventEmitter<T[]>();
    const changeActiveEmitter = new EventEmitter<T[]>();
    const triggerButtonEmitter = new EventEmitter<any>();
    const triggerItemButtonEmitter = new EventEmitter<any>();
    return {
      placeholder: '',
      matchOnDescription: false,
      matchOnDetail: false,
      set title(t: string) {
        title = t;
      },
      get title() {
        return title;
      },
      set buttons(b: any[]) {
        buttons = b;
      },
      get buttons() {
        return buttons;
      },
      set value(v: string) {
        value = v;
      },
      get value() {
        return value;
      },
      set busy(b: boolean) {
        busy = b;
      },
      get busy() {
        return busy;
      },
      set items(val: T[]) {
        items = val;
      },
      get items() {
        return items;
      },
      set selectedItems(val: T[]) {
        selectedItems = val;
        changeSelectionEmitter.fire(val);
      },
      get selectedItems() {
        return selectedItems;
      },
      onDidAccept: acceptEmitter.event,
      onDidHide: hideEmitter.event,
      onDidChangeValue: changeValueEmitter.event,
      onDidChangeSelection: changeSelectionEmitter.event,
      onDidChangeActive: changeActiveEmitter.event,
      onDidTriggerButton: triggerButtonEmitter.event,
      onDidTriggerItemButton: triggerItemButtonEmitter.event,
      show: () => {
        visible = true;
      },
      hide: () => {
        if (visible) {
          visible = false;
          hideEmitter.fire();
        }
      },
      dispose: () => {
        if (visible) {
          visible = false;
          hideEmitter.fire();
        }
        acceptEmitter.dispose();
        hideEmitter.dispose();
        changeValueEmitter.dispose();
        changeSelectionEmitter.dispose();
        changeActiveEmitter.dispose();
        triggerButtonEmitter.dispose();
        triggerItemButtonEmitter.dispose();
      },
      _fireChangeValue: (val: string) => {
        value = val;
        changeValueEmitter.fire(val);
      },
      _fireChangeActive: (items: T[]) => {
        changeActiveEmitter.fire(items);
      },
      _fireAccept: () => {
        acceptEmitter.fire();
      },
      _fireTriggerButton: (btn: any) => {
        triggerButtonEmitter.fire(btn);
      },
      _fireTriggerItemButton: (item: any, button: any) => {
        triggerItemButtonEmitter.fire({ item, button });
      },
      _isVisible: () => visible,
    };
  },
  createWebviewPanel: (viewType: string, title: string, showOptions: any, options?: any) => {
    let html = '';
    const messageEmitter = new EventEmitter<any>();
    const disposeEmitter = new EventEmitter<void>();
    let disposed = false;
    const postedMessages: any[] = [];
    const webview = {
      set html(val: string) {
        html = val;
      },
      get html() {
        return html;
      },
      cspSource: 'https://test.vscode-resource.vscode-cdn.net',
      asWebviewUri: (uri: Uri) => Uri.parse(`vscode-webview-resource://${uri.fsPath}`),
      onDidReceiveMessage: messageEmitter.event,
      _postedMessages: postedMessages,
      postMessage: async (msg: any) => {
        postedMessages.push(msg);
        return true;
      },
      _simulateMessage: (msg: any) => messageEmitter.fire(msg),
    };
    const panel = {
      viewType,
      title,
      showOptions,
      options,
      webview,
      onDidDispose: disposeEmitter.event,
      reveal: () => {},
      dispose: () => {
        disposed = true;
        disposeEmitter.fire();
        messageEmitter.dispose();
        disposeEmitter.dispose();
      },
      get disposed() {
        return disposed;
      },
    };
    return panel;
  },
  activeTextEditor: undefined as { document: { uri: Uri }; selection?: any } | undefined,
  onDidChangeActiveTextEditor: onDidChangeActiveTextEditorEmitter.event,
  onDidChangeTextEditorSelection: onDidChangeTextEditorSelectionEmitter.event,
  onDidChangeWindowState: onDidChangeWindowStateEmitter.event,
  _setActiveTextEditor: (editor?: { document: { uri: Uri }; selection?: any }) => {
    window.activeTextEditor = editor;
    onDidChangeActiveTextEditorEmitter.fire(editor);
  },
};

const commandRegistry = new Map<string, (...args: any[]) => any>();

export const commands = {
  registerCommand: (command: string, callback: (...args: any[]) => any) => {
    commandRegistry.set(command, callback);
    return {
      dispose: () => {
        commandRegistry.delete(command);
      },
    };
  },
  executeCommand: async (command: string, ...args: any[]) => {
    const handler = commandRegistry.get(command);
    if (handler) {
      return handler(...args);
    }
    return undefined;
  },
};

const configStore: Record<string, any> = {};
const inspectStore: Record<string, Record<string, any>> = {};
const configUpdates: Array<{
  section?: string;
  key: string;
  value: any;
  target?: any;
}> = [];

export const workspace = {
  _setConfig: (sectionOrKey: string, value: any) => {
    configStore[sectionOrKey] = value;
  },
  _setInspect: (section: string, property: string, value: any) => {
    if (!inspectStore[section]) {
      inspectStore[section] = {};
    }
    inspectStore[section][property] = value;
  },
  _clearConfigs: () => {
    Object.keys(configStore).forEach((k) => delete configStore[k]);
    Object.keys(inspectStore).forEach((k) => delete inspectStore[k]);
    configUpdates.length = 0;
  },
  _getConfigUpdates: () => [...configUpdates],
  isTrusted: true,
  _setIsTrusted: (trusted: boolean) => {
    workspace.isTrusted = trusted;
  },
  getConfiguration: (section?: string, _scope?: any) => ({
    get: (key: string, defaultValue?: unknown) => {
      const fullKey = section ? `${section}.${key}` : key;
      if (configStore[fullKey] !== undefined) {
        return configStore[fullKey];
      }
      if (section && configStore[section] && configStore[section][key] !== undefined) {
        return configStore[section][key];
      }
      return defaultValue;
    },
    inspect: (key: string) => {
      if (section && inspectStore[section] && inspectStore[section][key]) {
        return inspectStore[section][key];
      }
      return undefined;
    },
    update: async (key: string, value: any, target?: any) => {
      const fullKey = section ? `${section}.${key}` : key;
      configUpdates.push({ section, key, value, target });
      configStore[fullKey] = value;
      if (section) {
        if (!configStore[section] || typeof configStore[section] !== 'object') {
          configStore[section] = {};
        }
        configStore[section][key] = value;
      }
    },
  }),
  onDidChangeConfiguration: () => ({
    dispose: () => {},
  }),
  onDidChangeTextDocument: onDidChangeTextDocumentEmitter.event,
  openTextDocument: async (uriOrPath: any) => {
    const fsPath = typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.fsPath;
    const uri = typeof uriOrPath === 'string' ? Uri.file(uriOrPath) : uriOrPath;
    let content = '';
    try {
      if (fs.existsSync(fsPath)) {
        content = fs.readFileSync(fsPath, 'utf8');
      }
    } catch {
      // ignore
    }
    const lines = content.split(/\r?\n/);
    return {
      uri,
      getText: (range?: Range) => {
        if (!range) {
          return content;
        }
        return content;
      },
      lineCount: lines.length,
      lineAt: (line: number) => ({
        text: lines[line] ?? '',
        range: new Range(line, 0, line, (lines[line] ?? '').length),
      }),
    };
  },
  asRelativePath: (pathOrUri: any) => {
    const p = typeof pathOrUri === 'string' ? pathOrUri : (pathOrUri?.fsPath ?? '');
    return p.replace(/\\/g, '/').split('/').slice(-2).join('/');
  },
  workspaceFolders: undefined as MockWorkspaceFolder[] | undefined,
  onDidChangeWorkspaceFolders: onDidChangeWorkspaceFoldersEmitter.event,
  getWorkspaceFolder: (uri: Uri): MockWorkspaceFolder | undefined => {
    if (!workspace.workspaceFolders) {
      return undefined;
    }
    const uriPath = uri.fsPath.toLowerCase().replace(/\\/g, '/');
    return workspace.workspaceFolders.find((folder) => {
      const folderPath = folder.uri.fsPath.toLowerCase().replace(/\\/g, '/');
      return uriPath === folderPath || uriPath.startsWith(folderPath + '/');
    });
  },
  createFileSystemWatcher: (_glob: string) => ({
    onDidCreate: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  _setWorkspaceFolders: (folders?: MockWorkspaceFolder[]) => {
    workspace.workspaceFolders = folders;
    onDidChangeWorkspaceFoldersEmitter.fire({
      added: folders ?? [],
      removed: [],
    });
  },
};

export const extensions = {
  getExtension: (_id: string): any => undefined,
  all: [],
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export class ThemeColor {
  constructor(public id: string) {}
}

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(startLine: number, startChar: number, endLine: number, endChar: number);
  constructor(start: Position, end: Position);
  constructor(
    startOrLine: number | Position,
    startCharOrEnd: number | Position,
    endLine?: number,
    endChar?: number
  ) {
    if (typeof startOrLine === 'number') {
      this.start = new Position(startOrLine, startCharOrEnd as number);
      this.end = new Position(endLine ?? startOrLine, endChar ?? (startCharOrEnd as number));
    } else {
      this.start = startOrLine;
      this.end = startCharOrEnd as Position;
    }
  }
}

export class Selection extends Range {
  public readonly anchor: Position;
  public readonly active: Position;

  constructor(anchor: Position, active: Position);
  constructor(anchorLine: number, anchorChar: number, activeLine: number, activeChar: number);
  constructor(
    anchorOrLine: Position | number,
    activeOrChar: Position | number,
    activeLine?: number,
    activeChar?: number
  ) {
    if (typeof anchorOrLine === 'number') {
      super(
        anchorOrLine,
        activeOrChar as number,
        activeLine ?? anchorOrLine,
        activeChar ?? (activeOrChar as number)
      );
      this.anchor = new Position(anchorOrLine, activeOrChar as number);
      this.active = new Position(
        activeLine ?? anchorOrLine,
        activeChar ?? (activeOrChar as number)
      );
    } else {
      super(anchorOrLine, activeOrChar as Position);
      this.anchor = anchorOrLine;
      this.active = activeOrChar as Position;
    }
  }
}

export const TextEditorRevealType = {
  Default: 0,
  InCenter: 1,
  InCenterIfOutsideViewport: 2,
  AtTop: 3,
};

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  Seven: 7,
  Eight: 8,
  Nine: 9,
};

export class Location {
  public readonly range: Range;

  constructor(
    public readonly uri: Uri,
    rangeOrPosition: Range | Position
  ) {
    if ('start' in rangeOrPosition) {
      this.range = rangeOrPosition;
    } else {
      this.range = new Range(rangeOrPosition, rangeOrPosition);
    }
  }
}

export const QuickPickItemKind = {
  Separator: -1,
  Default: 0,
};

export class CancellationError extends Error {
  constructor(message = 'Canceled') {
    super(message);
    this.name = 'CancellationError';
  }
}

export class CancellationTokenSource {
  private _listeners: ((e: any) => any)[] = [];

  public token = {
    isCancellationRequested: false,
    onCancellationRequested: (cb: any) => {
      this._listeners.push(cb);
      return {
        dispose: () => {
          this._listeners = this._listeners.filter((l) => l !== cb);
        },
      };
    },
  };

  public cancel(): void {
    if (!this.token.isCancellationRequested) {
      this.token.isCancellationRequested = true;
      for (const listener of [...this._listeners]) {
        try {
          listener(undefined);
        } catch {
          // ignore
        }
      }
    }
  }

  public dispose(): void {
    this.cancel();
    this._listeners = [];
  }
}

// Add findFiles to workspace mock
(workspace as any).findFiles = async (
  _include: any,
  _exclude?: any,
  _maxResults?: number
): Promise<Uri[]> => [];

export class ThemeIcon {
  public static readonly File = new ThemeIcon('file');
  public static readonly Folder = new ThemeIcon('folder');
  constructor(
    public readonly id: string,
    public readonly color?: any
  ) {}
}
