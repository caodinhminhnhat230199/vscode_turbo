export interface FileRecord {
  id: string;
  path: string;
  relativePath: string;
  language: string;
  size: number;
  mtime: number;
  generated: boolean;
}

export function createFileRecord(params: {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  mtime: number;
  generated?: boolean;
  id?: string;
}): FileRecord {
  const normalizedPath = params.path.replace(/\\/g, '/');
  return {
    id: params.id ?? Buffer.from(normalizedPath).toString('base64url'),
    path: normalizedPath,
    relativePath: params.relativePath.replace(/\\/g, '/'),
    language: params.language,
    size: params.size,
    mtime: params.mtime,
    generated: params.generated ?? false,
  };
}
