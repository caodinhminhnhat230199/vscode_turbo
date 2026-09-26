export interface SymbolRecord {
  id: string;
  fileId: string;
  name: string;
  kind: string;
  line: number;
  column: number;
  containerName?: string;
  adapterId: string;
}

export function createSymbolRecord(params: {
  fileId: string;
  name: string;
  kind: string;
  line: number;
  column: number;
  containerName?: string;
  adapterId: string;
  id?: string;
}): SymbolRecord {
  return {
    id: params.id ?? `${params.fileId}:${params.line}:${params.column}:${params.name}`,
    fileId: params.fileId,
    name: params.name,
    kind: params.kind,
    line: params.line,
    column: params.column,
    containerName: params.containerName,
    adapterId: params.adapterId,
  };
}
