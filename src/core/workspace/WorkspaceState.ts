export interface WorkspaceFolderInfo {
  name: string;
  uri: string;
  fsPath: string;
  index: number;
}

export interface WorkspaceState {
  folders: WorkspaceFolderInfo[];
  activeFolder?: WorkspaceFolderInfo;
  isMultiRoot: boolean;
  isEmpty: boolean;
}

export function createEmptyWorkspaceState(): WorkspaceState {
  return {
    folders: [],
    isMultiRoot: false,
    isEmpty: true,
  };
}
