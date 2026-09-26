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
  showTextDocument: async (_docOrUri: any, _options?: any) => ({}),
  createQuickPick: <T extends any = any>() => {
    let items: T[] = [];
    const acceptEmitter = new EventEmitter<void>();
    const hideEmitter = new EventEmitter<void>();
    return {
      title: '',
      placeholder: '',
      matchOnDescription: false,
      matchOnDetail: false,
      selectedItems: [] as T[],
      set items(val: T[]) {
        items = val;
      },
      get items() {
        return items;
      },
      onDidAccept: acceptEmitter.event,
      onDidHide: hideEmitter.event,
      show: () => {},
      hide: () => {},
      dispose: () => {},
    };
  },
  activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
  onDidChangeActiveTextEditor: onDidChangeActiveTextEditorEmitter.event,
  onDidChangeTextEditorSelection: onDidChangeTextEditorSelectionEmitter.event,
  onDidChangeWindowState: onDidChangeWindowStateEmitter.event,
  _setActiveTextEditor: (editor?: { document: { uri: Uri } }) => {
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
  },
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
    update: async (key: string, value: any, _target?: any) => {
      const fullKey = section ? `${section}.${key}` : key;
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

export class CancellationTokenSource {
  public token = {
    isCancellationRequested: false,
    onCancellationRequested: (_cb: any) => ({ dispose: () => {} }),
  };
  public cancel(): void {
    this.token.isCancellationRequested = true;
  }
  public dispose(): void {
    this.cancel();
  }
}

// Add findFiles to workspace mock
(workspace as any).findFiles = async (
  _include: any,
  _exclude?: any,
  _maxResults?: number
): Promise<Uri[]> => [];
