import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectIndexService } from '../../../src/index/ProjectIndexService';
import { IndexEngine } from '../../../src/index/engine/IndexEngine';
import { MemoryIndexStore } from '../../../src/index/store/MemoryIndexStore';
import { createFileRecord } from '../../../src/index/models/FileRecord';

describe('ProjectIndexService', () => {
  let service: ProjectIndexService;
  let store: MemoryIndexStore;

  beforeEach(async () => {
    store = new MemoryIndexStore();
    await store.initialize();
    const engine = new IndexEngine({ store });
    service = new ProjectIndexService(engine);
  });

  it('searches indexed files with extension filters', async () => {
    await store.addFile(
      createFileRecord({
        path: '/workspace/src/UserService.ts',
        relativePath: 'src/UserService.ts',
        language: 'typescript',
        size: 100,
        mtime: Date.now(),
      })
    );
    await store.addFile(
      createFileRecord({
        path: '/workspace/lib/user_service.dart',
        relativePath: 'lib/user_service.dart',
        language: 'dart',
        size: 100,
        mtime: Date.now(),
      })
    );

    const tsFiles = await service.searchFiles('user', { fileExtensions: ['.ts'] });
    expect(tsFiles.length).toBe(1);
    expect(tsFiles[0].path).toContain('UserService.ts');

    const allUser = await service.searchFiles('user');
    expect(allUser.length).toBe(2);
  });

  it('retrieves health and store stats', () => {
    const health = service.getHealth();
    expect(health.status).toBe('healthy');

    const stats = service.getStats();
    expect(stats.schemaVersion).toBeGreaterThanOrEqual(1);
  });
});
