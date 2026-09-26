import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActivityMonitor } from '../../../src/warmup/activity/ActivityMonitor';

describe('ActivityMonitor', () => {
  let monitor: ActivityMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new ActivityMonitor({
      highToLowCooldownMs: 500,
      lowToIdleCooldownMs: 300,
    });
  });

  afterEach(() => {
    monitor.dispose();
    vi.useRealTimers();
  });

  it('starts at idle level', () => {
    expect(monitor.getLevel()).toBe('idle');
    expect(monitor.isIdle()).toBe(true);
    expect(monitor.isHigh()).toBe(false);
  });

  it('transitions to high activity immediately on document edit', () => {
    const events: string[] = [];
    monitor.onDidChangeActivity((lvl) => events.push(lvl));

    monitor.recordEdit();

    expect(monitor.getLevel()).toBe('high');
    expect(monitor.isHigh()).toBe(true);
    expect(events).toEqual(['high']);
  });

  it('cooldowns from high to low then to idle over time', () => {
    const events: string[] = [];
    monitor.onDidChangeActivity((lvl) => events.push(lvl));

    monitor.recordEdit();
    expect(monitor.getLevel()).toBe('high');

    // Advance 500ms -> should cooldown to low
    vi.advanceTimersByTime(500);
    expect(monitor.getLevel()).toBe('low');

    // Advance 300ms -> should cooldown to idle
    vi.advanceTimersByTime(300);
    expect(monitor.getLevel()).toBe('idle');
    expect(monitor.isIdle()).toBe(true);

    expect(events).toEqual(['high', 'low', 'idle']);
  });

  it('resets cooldown timer on repeated rapid typing', () => {
    monitor.recordEdit();
    expect(monitor.getLevel()).toBe('high');

    // Advance 400ms (not yet 500ms)
    vi.advanceTimersByTime(400);
    expect(monitor.getLevel()).toBe('high');

    // Type again -> resets cooldown timer
    monitor.recordEdit();

    // Advance 400ms -> still high because timer was reset
    vi.advanceTimersByTime(400);
    expect(monitor.getLevel()).toBe('high');

    // Advance remaining 100ms -> now steps down to low
    vi.advanceTimersByTime(100);
    expect(monitor.getLevel()).toBe('low');
  });

  it('transitions to low on selection or editor change when idle', () => {
    monitor.recordSelectionChange();
    expect(monitor.getLevel()).toBe('low');

    vi.advanceTimersByTime(300);
    expect(monitor.getLevel()).toBe('idle');

    monitor.recordEditorChange();
    expect(monitor.getLevel()).toBe('low');
  });

  it('transitions to high on navigation activity', () => {
    monitor.recordNavigationActivity();
    expect(monitor.getLevel()).toBe('high');
  });

  it('drops to idle immediately when window loses focus', () => {
    monitor.recordEdit();
    expect(monitor.getLevel()).toBe('high');

    monitor.recordWindowStateChange(false);
    expect(monitor.getLevel()).toBe('idle');
  });
});
