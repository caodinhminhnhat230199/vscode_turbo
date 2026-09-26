import * as fs from 'fs';
import * as path from 'path';
import { EdgeType, GraphEdge, NeighborResult } from './graphTypes';
import { logger } from '../core/logging/Logger';

export interface NeighborQueryOptions {
  maxDepth?: number;
  types?: EdgeType[];
  limit?: number;
}

export class DependencyGraph {
  private static instance: DependencyGraph | null = null;

  // fromNode -> Map<toNode:type, GraphEdge>
  private outgoing = new Map<string, Map<string, GraphEdge>>();
  // toNode -> Map<fromNode:type, GraphEdge>
  private incoming = new Map<string, Map<string, GraphEdge>>();

  private persistenceFilePath?: string;

  public static getInstance(): DependencyGraph {
    if (!DependencyGraph.instance) {
      DependencyGraph.instance = new DependencyGraph();
    }
    return DependencyGraph.instance;
  }

  public setPersistencePath(filePath: string): void {
    this.persistenceFilePath = filePath;
  }

  public async load(): Promise<void> {
    if (!this.persistenceFilePath || !fs.existsSync(this.persistenceFilePath)) {
      return;
    }

    try {
      const data = await fs.promises.readFile(this.persistenceFilePath, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed.edges)) {
        this.clear();
        for (const edge of parsed.edges) {
          this.addEdge(edge);
        }
      }
    } catch (err) {
      logger.debug('Failed to load dependency graph', { error: String(err) });
    }
  }

  public async save(): Promise<void> {
    if (!this.persistenceFilePath) {
      return;
    }

    try {
      const dir = path.dirname(this.persistenceFilePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      const edges = this.getAllEdges();
      await fs.promises.writeFile(
        this.persistenceFilePath,
        JSON.stringify({ version: 1, edges }, null, 2),
        'utf8'
      );
    } catch (err) {
      logger.debug('Failed to save dependency graph', { error: String(err) });
    }
  }

  public addEdge(edge: GraphEdge): void {
    const from = this.normalize(edge.from);
    const to = this.normalize(edge.to);
    if (!from || !to || from === to) {
      return;
    }

    const normEdge: GraphEdge = {
      ...edge,
      from,
      to,
      weight: edge.weight ?? 1,
      lastUpdated: edge.lastUpdated ?? Date.now(),
    };

    const key = `${to}::${edge.type}`;

    if (!this.outgoing.has(from)) {
      this.outgoing.set(from, new Map());
    }
    this.outgoing.get(from)!.set(key, normEdge);

    const inKey = `${from}::${edge.type}`;
    if (!this.incoming.has(to)) {
      this.incoming.set(to, new Map());
    }
    this.incoming.get(to)!.set(inKey, normEdge);
  }

  public replaceEdgesForFile(fromFile: string, edges: GraphEdge[]): void {
    const normFrom = this.normalize(fromFile);

    // Remove existing outgoing edges for this file
    const existing = this.outgoing.get(normFrom);
    if (existing) {
      for (const edge of existing.values()) {
        const inMap = this.incoming.get(edge.to);
        if (inMap) {
          inMap.delete(`${normFrom}::${edge.type}`);
          if (inMap.size === 0) {
            this.incoming.delete(edge.to);
          }
        }
      }
      this.outgoing.delete(normFrom);
    }

    // Add new edges
    for (const e of edges) {
      this.addEdge({ ...e, from: normFrom });
    }
  }

  public removeEdgesForFile(filePath: string): void {
    const norm = this.normalize(filePath);

    // Outgoing edges
    const outMap = this.outgoing.get(norm);
    if (outMap) {
      for (const edge of outMap.values()) {
        const inMap = this.incoming.get(edge.to);
        if (inMap) {
          inMap.delete(`${norm}::${edge.type}`);
          if (inMap.size === 0) {
            this.incoming.delete(edge.to);
          }
        }
      }
      this.outgoing.delete(norm);
    }

    // Incoming edges
    const inMap = this.incoming.get(norm);
    if (inMap) {
      for (const edge of inMap.values()) {
        const outM = this.outgoing.get(edge.from);
        if (outM) {
          outM.delete(`${norm}::${edge.type}`);
          if (outM.size === 0) {
            this.outgoing.delete(edge.from);
          }
        }
      }
      this.incoming.delete(norm);
    }
  }

  public recordNavigation(fromFile: string, toFile: string, weightIncrement = 1): void {
    const from = this.normalize(fromFile);
    const to = this.normalize(toFile);
    if (!from || !to || from === to) {
      return;
    }

    const key = `${to}::navigation`;
    const outMap = this.outgoing.get(from);
    const existing = outMap?.get(key);

    const weight = (existing?.weight ?? 0) + weightIncrement;
    this.addEdge({
      from,
      to,
      type: 'navigation',
      weight,
      lastUpdated: Date.now(),
    });
  }

  public getOutgoingEdges(filePath: string, types?: EdgeType[]): GraphEdge[] {
    const norm = this.normalize(filePath);
    const map = this.outgoing.get(norm);
    if (!map) {
      return [];
    }

    const all = Array.from(map.values());
    if (!types || types.length === 0) {
      return all;
    }
    const typeSet = new Set(types);
    return all.filter((e) => typeSet.has(e.type));
  }

  public getIncomingEdges(filePath: string, types?: EdgeType[]): GraphEdge[] {
    const norm = this.normalize(filePath);
    const map = this.incoming.get(norm);
    if (!map) {
      return [];
    }

    const all = Array.from(map.values());
    if (!types || types.length === 0) {
      return all;
    }
    const typeSet = new Set(types);
    return all.filter((e) => typeSet.has(e.type));
  }

  public getNeighbors(filePath: string, options: NeighborQueryOptions = {}): NeighborResult[] {
    const root = this.normalize(filePath);
    const maxDepth = options.maxDepth ?? 2;
    const limit = options.limit ?? 20;
    const types = options.types;

    const results: NeighborResult[] = [];
    const visited = new Set<string>([root]);

    // BFS Queue: [path, distance, accumulatedWeight, edgeType]
    const queue: Array<{ path: string; distance: number; weight: number; edgeType: EdgeType }> = [];

    // Initialize with direct neighbors
    const directOutgoing = this.getOutgoingEdges(root, types);
    for (const edge of directOutgoing) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        const item = {
          path: edge.to,
          distance: 1,
          weight: edge.weight ?? 1,
          edgeType: edge.type,
        };
        queue.push(item);
        results.push(item);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.distance >= maxDepth) {
        continue;
      }

      const nextOutgoing = this.getOutgoingEdges(current.path, types);
      for (const edge of nextOutgoing) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          const item = {
            path: edge.to,
            distance: current.distance + 1,
            weight: edge.weight ?? 1,
            edgeType: edge.type,
          };
          queue.push(item);
          results.push(item);

          if (results.length >= limit) {
            return results;
          }
        }
      }
    }

    return results;
  }

  public getAllEdges(): GraphEdge[] {
    const edges: GraphEdge[] = [];
    for (const map of this.outgoing.values()) {
      edges.push(...map.values());
    }
    return edges;
  }

  public getNodeCount(): number {
    const nodes = new Set<string>();
    for (const [from, map] of this.outgoing.entries()) {
      nodes.add(from);
      for (const edge of map.values()) {
        nodes.add(edge.to);
      }
    }
    return nodes.size;
  }

  public getEdgeCount(): number {
    let count = 0;
    for (const map of this.outgoing.values()) {
      count += map.size;
    }
    return count;
  }

  public clear(): void {
    this.outgoing.clear();
    this.incoming.clear();
  }

  private normalize(fp: string): string {
    return fp ? fp.replace(/\\/g, '/') : '';
  }
}

export const dependencyGraph = DependencyGraph.getInstance();
