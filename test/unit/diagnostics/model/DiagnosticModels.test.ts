import { describe, it, expect } from 'vitest';
import {
  createEvidence,
  serializeEvidence,
  deserializeEvidence,
} from '../../../../src/diagnostics/model/Evidence';
import {
  createRecommendation,
  serializeRecommendation,
  deserializeRecommendation,
} from '../../../../src/diagnostics/model/Recommendation';
import {
  createFinding,
  generateFindingId,
  serializeFinding,
  deserializeFinding,
} from '../../../../src/diagnostics/model/Finding';

describe('Diagnostic Domain Models', () => {
  describe('Evidence', () => {
    it('creates and serializes evidence with source metadata', () => {
      const evidence = createEvidence('Total files', 50000, 'WorkspaceScanner', 'files', {
        scannedDurationMs: 120,
      });

      expect(evidence.label).toBe('Total files');
      expect(evidence.value).toBe(50000);
      expect(evidence.source).toBe('WorkspaceScanner');
      expect(evidence.unit).toBe('files');
      expect(evidence.metadata?.['scannedDurationMs']).toBe(120);

      const json = serializeEvidence(evidence);
      const deserialized = deserializeEvidence(json);

      expect(deserialized).toEqual(evidence);
    });

    it('throws when deserializing invalid evidence json', () => {
      expect(() => deserializeEvidence(JSON.stringify({ label: 'test' }))).toThrow();
    });
  });

  describe('Recommendation', () => {
    it('creates and serializes recommendation with changes', () => {
      const rec = createRecommendation({
        id: 'REC_EXCLUDE_BUILD',
        type: 'workspaceSetting',
        title: 'Exclude build directory from watcher',
        description: 'Add build/ to files.watcherExclude',
        safeToAutoApply: true,
        requiresReload: false,
        changes: [
          {
            section: 'files.watcherExclude',
            oldValue: {},
            newValue: { '**/build/**': true },
            description: 'Add **/build/**',
            target: 'workspace',
          },
        ],
        sourceMetadata: { rule: 'WATCHER_001' },
      });

      expect(rec.id).toBe('REC_EXCLUDE_BUILD');
      expect(rec.safeToAutoApply).toBe(true);
      expect(rec.changes).toHaveLength(1);

      const json = serializeRecommendation(rec);
      const deserialized = deserializeRecommendation(json);

      expect(deserialized).toEqual(rec);
    });

    it('throws when deserializing invalid recommendation json', () => {
      expect(() => deserializeRecommendation(JSON.stringify({ id: 'REC_1' }))).toThrow();
    });
  });

  describe('Finding', () => {
    it('generates deterministic stable finding IDs', () => {
      expect(generateFindingId('WATCHER_001')).toBe('WATCHER_001');
      expect(generateFindingId('watcher_001', 'build')).toBe('WATCHER_001:build');
      expect(generateFindingId('search_001', 'node_modules/')).toBe('SEARCH_001:node_modules');
      expect(generateFindingId('file_001', 'src\\big\\file.dart')).toBe(
        'FILE_001:src/big/file.dart'
      );
    });

    it('creates and serializes performance finding with source metadata', () => {
      const evidence = [createEvidence('Folder', 'build', 'WatcherDiagnostic')];
      const rec = createRecommendation({
        id: 'REC_001',
        type: 'workspaceSetting',
        title: 'Exclude folder',
        description: 'Exclude',
      });

      const finding = createFinding({
        ruleId: 'WATCHER_001',
        target: 'build',
        category: 'filesystem',
        severity: 'high',
        confidence: 'high',
        title: 'Build directory not watcher-excluded',
        summary: 'Directory build exists but is monitored by file watcher',
        evidence,
        recommendation: rec,
        detector: 'WatcherDiagnostic',
        details: { folderSize: 1048576 },
      });

      expect(finding.id).toBe('WATCHER_001:build');
      expect(finding.sourceMetadata?.ruleId).toBe('WATCHER_001');
      expect(finding.sourceMetadata?.detector).toBe('WatcherDiagnostic');
      expect(finding.sourceMetadata?.target).toBe('build');

      const json = serializeFinding(finding);
      const deserialized = deserializeFinding(json);

      expect(deserialized.id).toBe(finding.id);
      expect(deserialized.category).toBe(finding.category);
      expect(deserialized.severity).toBe(finding.severity);
      expect(deserialized.evidence).toHaveLength(1);
    });

    it('throws when deserializing invalid finding json', () => {
      expect(() => deserializeFinding(JSON.stringify({ id: 'F1' }))).toThrow();
    });
  });
});
