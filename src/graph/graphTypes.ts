export type EdgeType = 'import' | 'export' | 'navigation' | 'reference';

export interface GraphNode {
  id: string; // normalized file path
  kind: 'file' | 'symbol';
  symbolName?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string; // normalized file path
  to: string; // normalized file path
  type: EdgeType;
  weight?: number;
  lastUpdated?: number;
  metadata?: Record<string, unknown>;
}

export interface NeighborResult {
  path: string;
  distance: number;
  edgeType: EdgeType;
  weight: number;
}
