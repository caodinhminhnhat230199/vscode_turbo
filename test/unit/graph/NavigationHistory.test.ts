import { describe, it, expect, beforeEach } from 'vitest';
import { NavigationHistory } from '../../../src/graph/NavigationHistory';
import { configService } from '../../../src/vscode/config';

describe('P9.3 — NavigationHistory', () => {
  let navHistory: NavigationHistory;

  beforeEach(() => {
    navHistory = new NavigationHistory();
    navHistory.clear();
  });

  it('records navigation entries and retrieves recent targets', () => {
    navHistory.record('/src/a.ts', '/src/b.ts', 'myFunction');
    navHistory.record('/src/a.ts', '/src/c.ts', 'MyClass');

    const history = navHistory.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].toFile).toBe('/src/c.ts');
    expect(history[0].symbolName).toBe('MyClass');

    const targets = navHistory.getRecentTargets('/src/a.ts');
    expect(targets).toEqual(['/src/c.ts', '/src/b.ts']);
  });

  it('caps history at maximum entries limit (100)', () => {
    for (let i = 0; i < 150; i++) {
      navHistory.record('/src/from.ts', `/src/to_${i}.ts`);
    }

    const history = navHistory.getHistory();
    expect(history).toHaveLength(100);
    expect(history[0].toFile).toBe('/src/to_149.ts');
  });

  it('computes navigation frequency between files', () => {
    navHistory.record('/src/a.ts', '/src/b.ts');
    navHistory.record('/src/a.ts', '/src/b.ts');
    navHistory.record('/src/a.ts', '/src/c.ts');

    expect(navHistory.getNavigationFrequency('/src/a.ts', '/src/b.ts')).toBe(2);
    expect(navHistory.getNavigationFrequency('/src/a.ts', '/src/c.ts')).toBe(1);
    expect(navHistory.getNavigationFrequency('/src/a.ts', '/src/d.ts')).toBe(0);
  });

  it('honors config setting to disable history tracking', () => {
    const origConfig = configService.getConfig();
    (configService as any).currentConfig = {
      ...origConfig,
      navigationTrackHistory: false,
    };

    navHistory.record('/src/a.ts', '/src/b.ts');
    expect(navHistory.getHistory()).toHaveLength(0);

    // Restore config
    (configService as any).currentConfig = origConfig;
  });
});
