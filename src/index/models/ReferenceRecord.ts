export interface ReferenceRecord {
  id: string;
  symbolId?: string;
  fileId: string;
  line: number;
  column: number;
  isWrite?: boolean;
}

export function createReferenceRecord(params: {
  fileId: string;
  line: number;
  column: number;
  symbolId?: string;
  isWrite?: boolean;
  id?: string;
}): ReferenceRecord {
  return {
    id: params.id ?? `${params.fileId}:${params.line}:${params.column}:${params.symbolId ?? 'ref'}`,
    fileId: params.fileId,
    line: params.line,
    column: params.column,
    symbolId: params.symbolId,
    isWrite: params.isWrite ?? false,
  };
}
