import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DependencyGraph } from '../../../src/graph/DependencyGraph';

describe('P9.1 & P9.2 — DependencyGraph', () => {
  let graph: DependencyGraph;
  let tempDir: string;

  beforeEach(() => {
    graph = new DependencyGraph();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepulse-graph-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('adds edges and retrieves outgoing and incoming edges', () => {
    graph.addEdge({
      from: '/src/main.ts',
      to: '/src/services/user.ts',
      type: 'import',
      weight: 1,
    });
    graph.addEdge({
      from: '/src/main.ts',
      to: '/src/utils.ts',
      type: 'import',
      weight: 1,
    });

    const outgoing = graph.getOutgoingEdges('/src/main.ts');
    expect(outgoing).toHaveLength(2);
    expect(outgoing.map((e) => e.to)).toContain('/src/services/user.ts');
    expect(outgoing.map((e) => e.to)).toContain('/src/utils.ts');

    const incoming = graph.getIncomingEdges('/src/services/user.ts');
    expect(incoming).toHaveLength(1);
    expect(incoming[0].from).toBe('/src/main.ts');
  });

  it('replaces edges incrementally for a single file', () => {
    graph.addEdge({
      from: '/src/main.ts',
      to: '/src/old.ts',
      type: 'import',
    });

    graph.replaceEdgesForFile('/src/main.ts', [
      { from: '/src/main.ts', to: '/src/new1.ts', type: 'import' },
      { from: '/src/main.ts', to: '/src/new2.ts', type: 'export' },
    ]);

    const outgoing = graph.getOutgoingEdges('/src/main.ts');
    expect(outgoing).toHaveLength(2);
    expect(outgoing.map((e) => e.to)).not.toContain('/src/old.ts');
    expect(outgoing.map((e) => e.to)).toContain('/src/new1.ts');
    expect(outgoing.map((e) => e.to)).toContain('/src/new2.ts');

    expect(graph.getIncomingEdges('/src/old.ts')).toHaveLength(0);
  });

  it('cleans up both incoming and outgoing edges on file removal', () => {
    graph.addEdge({ from: '/src/a.ts', to: '/src/b.ts', type: 'import' });
    graph.addEdge({ from: '/src/b.ts', to: '/src/c.ts', type: 'import' });

    graph.removeEdgesForFile('/src/b.ts');

    expect(graph.getOutgoingEdges('/src/a.ts')).toHaveLength(0);
    expect(graph.getOutgoingEdges('/src/b.ts')).toHaveLength(0);
    expect(graph.getIncomingEdges('/src/c.ts')).toHaveLength(0);
  });

  it('queries neighbors with depth limit and BFS traversal', () => {
    // a -> b -> c -> d
    graph.addEdge({ from: '/a.ts', to: '/b.ts', type: 'import' });
    graph.addEdge({ from: '/b.ts', to: '/c.ts', type: 'import' });
    graph.addEdge({ from: '/c.ts', to: '/d.ts', type: 'import' });

    // Depth 1: only b
    const depth1 = graph.getNeighbors('/a.ts', { maxDepth: 1 });
    expect(depth1.map((n) => n.path)).toEqual(['/b.ts']);
    expect(depth1[0].distance).toBe(1);

    // Depth 2: b and c
    const depth2 = graph.getNeighbors('/a.ts', { maxDepth: 2 });
    expect(depth2.map((n) => n.path)).toEqual(['/b.ts', '/c.ts']);
    expect(depth2.find((n) => n.path === '/c.ts')?.distance).toBe(2);

    // Filter by type
    graph.addEdge({ from: '/a.ts', to: '/x.ts', type: 'navigation' });
    const onlyImports = graph.getNeighbors('/a.ts', { maxDepth: 1, types: ['import'] });
    expect(onlyImports.map((n) => n.path)).toEqual(['/b.ts']);
  });

  it('increments weight on repeated navigation recording', () => {
    graph.recordNavigation('/a.ts', '/b.ts');
    graph.recordNavigation('/a.ts', '/b.ts');

    const edges = graph.getOutgoingEdges('/a.ts', ['navigation']);
    expect(edges).toHaveLength(1);
    expect(edges[0].weight).toBe(2);
  });

  it('persists and reloads graph from disk', async () => {
    const savePath = path.join(tempDir, 'graph.json');
    graph.setPersistencePath(savePath);

    graph.addEdge({ from: '/a.ts', to: '/b.ts', type: 'import', weight: 5 });
    await graph.save();

    expect(fs.existsSync(savePath)).toBe(true);

    const newGraph = new DependencyGraph();
    newGraph.setPersistencePath(savePath);
    await newGraph.load();

    const edges = newGraph.getOutgoingEdges('/a.ts');
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe('/b.ts');
    expect(edges[0].weight).toBe(5);
  });
});
