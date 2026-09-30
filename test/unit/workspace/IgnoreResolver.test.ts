import { describe, it, expect } from 'vitest';
import { IgnoreResolver } from '../../../src/workspace/IgnoreResolver';

describe('IgnoreResolver', () => {
  it('correctly identifies default ignored directories', () => {
    const resolver = new IgnoreResolver();

    expect(resolver.isIgnored('/workspace/node_modules/express/index.js')).toBe(true);
    expect(resolver.isIgnored('C:\\project\\.git\\HEAD')).toBe(true);
    expect(resolver.isIgnored('/workspace/build/output.js')).toBe(true);
    expect(resolver.isIgnored('/workspace/.dart_tool/package_config.json')).toBe(true);
    expect(resolver.isIgnored('/workspace/dist/bundle.js')).toBe(true);
  });

  it('allows normal source files', () => {
    const resolver = new IgnoreResolver();

    expect(resolver.isIgnored('/workspace/src/index.ts')).toBe(false);
    expect(resolver.isIgnored('/workspace/lib/main.dart')).toBe(false);
    expect(resolver.isIgnored('/workspace/services/UserService.java')).toBe(false);
  });

  it('incorporates custom exclude settings', () => {
    const resolver = new IgnoreResolver({
      customExcludes: ['custom_generated'],
      filesExclude: { '**/secret/**': true },
    });

    expect(resolver.isIgnored('/workspace/custom_generated/foo.ts')).toBe(true);
    expect(resolver.isIgnored('/workspace/secret/keys.json')).toBe(true);
    expect(resolver.isIgnored('/workspace/src/app.ts')).toBe(false);
  });
});
