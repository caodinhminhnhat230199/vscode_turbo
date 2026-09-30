import { describe, it, expect, beforeEach } from 'vitest';
import { CancellationManager } from '../../../../src/core/cancellation/CancellationManager';

describe('CancellationManager', () => {
  let manager: CancellationManager;

  beforeEach(() => {
    manager = new CancellationManager();
  });

  it('creates and retrieves cancellation tokens', () => {
    const source = manager.createTokenSource('token-1', 'group-1');
    expect(source.token.isCancellationRequested).toBe(false);

    const token = manager.getToken('token-1');
    expect(token).toBe(source.token);
  });

  it('cancels a specific token by ID', () => {
    const source = manager.createTokenSource('token-1');
    let wasCancelled = false;
    source.token.onCancellationRequested(() => {
      wasCancelled = true;
    });

    const result = manager.cancel('token-1');
    expect(result).toBe(true);
    expect(wasCancelled).toBe(true);
    expect(source.token.isCancellationRequested).toBe(true);
    expect(manager.getToken('token-1')).toBeUndefined();
  });

  it('cancels all tokens belonging to a group', () => {
    const s1 = manager.createTokenSource('t1', 'group-search');
    const s2 = manager.createTokenSource('t2', 'group-search');
    const s3 = manager.createTokenSource('t3', 'group-other');

    const cancelledCount = manager.cancelGroup('group-search');
    expect(cancelledCount).toBe(2);
    expect(s1.token.isCancellationRequested).toBe(true);
    expect(s2.token.isCancellationRequested).toBe(true);
    expect(s3.token.isCancellationRequested).toBe(false);
  });

  it('clears all tokens upon clear()', () => {
    const s1 = manager.createTokenSource('t1');
    const s2 = manager.createTokenSource('t2');

    manager.clear();
    expect(s1.token.isCancellationRequested).toBe(true);
    expect(s2.token.isCancellationRequested).toBe(true);
    expect(manager.getToken('t1')).toBeUndefined();
    expect(manager.getToken('t2')).toBeUndefined();
  });
});
