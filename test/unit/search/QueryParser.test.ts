import { describe, it, expect } from 'vitest';
import { QueryParser } from '../../../src/search/QueryParser';

describe('QueryParser', () => {
  it('parses plain text queries', () => {
    const res = QueryParser.parse('UserService');
    expect(res.text).toBe('UserService');
    expect(res.typeFilter).toBeUndefined();
  });

  it('extracts type and kind filters', () => {
    const res = QueryParser.parse('getUser type:class kind:method');
    expect(res.text).toBe('getUser');
    expect(res.typeFilter).toBe('class');
    expect(res.kindFilter).toBe('method');
  });

  it('extracts path, ext, and lang filters', () => {
    const res = QueryParser.parse('login ext:dart path:auth/ lang:dart');
    expect(res.text).toBe('login');
    expect(res.extFilter).toBe('dart');
    expect(res.pathFilter).toBe('auth/');
    expect(res.langFilter).toBe('dart');
  });

  it('handles empty or whitespace query gracefully', () => {
    const res = QueryParser.parse('   ');
    expect(res.text).toBe('');
    expect(res.raw).toBe('');
  });

  it('validates type filter and returns warning on unknown type', () => {
    const res = QueryParser.parse('UserService type:unknown');
    expect(res.text).toBe('UserService');
    expect(res.typeFilter).toBeUndefined();
    expect(res.warnings).toBeDefined();
    expect(res.warnings?.[0]).toContain('Invalid search type "unknown"');
  });

  it('accepts valid type filters', () => {
    for (const t of ['all', 'class', 'file', 'symbol', 'text']) {
      const res = QueryParser.parse(`test type:${t}`);
      expect(res.typeFilter).toBe(t);
      expect(res.warnings).toBeUndefined();
    }
  });
});
