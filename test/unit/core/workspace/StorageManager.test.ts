import { describe, it, expect, beforeEach } from 'vitest';
import { StorageManager, StorageMemento } from '../../../../src/core/workspace/StorageManager';

class MockMemento implements StorageMemento {
  private map = new Map<string, unknown>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.map.has(key) ? (this.map.get(key) as T) : defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.map.delete(key);
    } else {
      this.map.set(key, value);
    }
  }

  keys(): readonly string[] {
    return Array.from(this.map.keys());
  }
}

describe('StorageManager', () => {
  let storage: StorageManager;
  let mockWorkspace: MockMemento;
  let mockGlobal: MockMemento;

  beforeEach(() => {
    storage = new StorageManager();
    mockWorkspace = new MockMemento();
    mockGlobal = new MockMemento();
    storage.setMementosForTest(mockWorkspace, mockGlobal);
  });

  it('initializes schema version on fresh workspace', () => {
    expect(mockWorkspace.get('vsturbo.storage.version')).toBe(1);
  });

  it('stores and retrieves workspace state', async () => {
    await storage.setWorkspace('lastScanTime', 123456);
    expect(storage.getWorkspace<number>('lastScanTime')).toBe(123456);
    expect(storage.getWorkspace<number>('nonExistent', 99)).toBe(99);
  });

  it('stores and retrieves global state', async () => {
    await storage.setGlobal('userDismissedBanner', true);
    expect(storage.getGlobal<boolean>('userDismissedBanner')).toBe(true);
  });
});
