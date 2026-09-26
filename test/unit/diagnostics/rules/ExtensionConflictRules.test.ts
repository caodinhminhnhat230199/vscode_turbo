import { describe, it, expect } from 'vitest';
import { ExtensionConflictRule } from '../../../../src/diagnostics/rules/extensionConflictRules';

describe('ExtensionConflictRule (EXTENSION_001)', () => {
  const rule = new ExtensionConflictRule();

  it('returns no findings when there are no conflicting extensions for languages', async () => {
    const findings = await rule.evaluate({
      installedExtensions: [
        {
          id: 'dart-code.dart-code',
          isActive: true,
          packageJSON: {
            contributes: {
              languages: [{ id: 'dart' }],
            },
          },
        },
        {
          id: 'ms-python.python',
          isActive: true,
          packageJSON: {
            contributes: {
              languages: [{ id: 'python' }],
            },
          },
        },
      ],
    });

    expect(findings).toHaveLength(0);
  });

  it('detects multiple active extensions contributing to the same language', async () => {
    const findings = await rule.evaluate({
      installedExtensions: [
        {
          id: 'dart-code.dart-code',
          isActive: true,
          packageJSON: {
            contributes: {
              languages: [{ id: 'dart' }],
            },
          },
        },
        {
          id: 'another-vendor.flutter-dart-extras',
          isActive: true,
          packageJSON: {
            activationEvents: ['onLanguage:dart'],
            contributes: {
              languages: [{ id: 'dart' }],
            },
          },
        },
      ],
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding.id).toBe('EXTENSION_001:dart');
    expect(finding.category).toBe('extension');
    expect(finding.confidence).toBe('medium'); // Heuristic, avoids unmeasured CPU attribution
    expect(finding.severity).toBe('medium');
    expect(finding.title).toContain('Possible extension capability overlap for "dart"');
    expect(finding.summary).toContain('dart-code.dart-code');
    expect(finding.summary).toContain('another-vendor.flutter-dart-extras');

    // Never auto-disables user extensions
    expect(finding.recommendation).toBeDefined();
    expect(finding.recommendation?.type).toBe('manualAction');
    expect(finding.recommendation?.safeToAutoApply).toBe(false);
  });

  it('ignores built-in vscode extensions', async () => {
    const findings = await rule.evaluate({
      installedExtensions: [
        {
          id: 'vscode.typescript-language-features',
          isActive: true,
          packageJSON: {
            contributes: { languages: [{ id: 'typescript' }] },
          },
        },
        {
          id: 'my-ts-extension',
          isActive: true,
          packageJSON: {
            contributes: { languages: [{ id: 'typescript' }] },
          },
        },
      ],
    });

    // Built-in should be filtered out, so no overlap detected
    expect(findings).toHaveLength(0);
  });
});
