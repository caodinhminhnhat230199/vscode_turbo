import * as vscode from 'vscode';
import { PerformanceFinding, createFinding } from '../model/Finding';
import { createEvidence } from '../model/Evidence';
import { createRecommendation } from '../model/Recommendation';
import { OptimizationContext, OptimizationRule } from '../../optimizer/OptimizationRule';

export interface ExtensionInfo {
  id: string;
  isActive: boolean;
  packageJSON?: Record<string, unknown>;
}

export class ExtensionConflictRule implements OptimizationRule {
  public readonly id = 'EXTENSION_001';
  public readonly name = 'Extension language capability overlap heuristic';

  public async evaluate(context: OptimizationContext): Promise<PerformanceFinding[]> {
    const findings: PerformanceFinding[] = [];

    // Allow context extension list for testing or fall back to vscode.extensions.all
    let rawExtensions: ReadonlyArray<ExtensionInfo>;
    if (context.installedExtensions && context.installedExtensions.length > 0) {
      rawExtensions = context.installedExtensions;
    } else {
      try {
        rawExtensions = (vscode.extensions?.all ?? []).map((e) => ({
          id: e.id,
          isActive: e.isActive,
          packageJSON: e.packageJSON as Record<string, unknown>,
        }));
      } catch {
        rawExtensions = [];
      }
    }

    // Ignore built-in extensions (usually start with 'vscode.')
    const nonBuiltin = rawExtensions.filter(
      (ext) => !ext.id.startsWith('vscode.') && !ext.id.startsWith('ms-vscode.default-')
    );

    // Map language -> extensions contributing to it
    const languageMap = new Map<string, ExtensionInfo[]>();

    for (const ext of nonBuiltin) {
      const pkg = ext.packageJSON;
      if (!pkg) {
        continue;
      }

      const contributes = pkg.contributes as Record<string, unknown> | undefined;
      const languages = (contributes?.languages as Array<{ id?: string }>) ?? [];
      const activationEvents = (pkg.activationEvents as string[]) ?? [];

      const detectedLangs = new Set<string>();

      for (const lang of languages) {
        if (lang.id) {
          detectedLangs.add(lang.id.toLowerCase());
        }
      }

      for (const act of activationEvents) {
        if (typeof act === 'string' && act.startsWith('onLanguage:')) {
          const langId = act.replace('onLanguage:', '').trim().toLowerCase();
          if (langId) {
            detectedLangs.add(langId);
          }
        }
      }

      for (const lang of detectedLangs) {
        if (!languageMap.has(lang)) {
          languageMap.set(lang, []);
        }
        languageMap.get(lang)!.push(ext);
      }
    }

    for (const [lang, extensions] of languageMap.entries()) {
      if (extensions.length >= 2) {
        const extIds = extensions.map((e) => e.id);
        const hasActive = extensions.some((e) => e.isActive);

        const evidence = [
          createEvidence('Target Language', lang, 'ExtensionConflictDetector'),
          createEvidence('Overlapping Extensions', extIds.join(', '), 'ExtensionConflictDetector'),
          createEvidence(
            'Assessment',
            'Possible overlap (unmeasured CPU attribution)',
            'ExtensionConflictDetector'
          ),
        ];

        const rec = createRecommendation({
          id: `REC_EXT_OVERLAP_${lang.toUpperCase()}`,
          type: 'manualAction',
          title: `Review installed extensions for ${lang}`,
          description: `Extensions ${extIds.join(' and ')} contribute overlapping capabilities for ${lang}. If you notice editor latency, consider disabling one manually in Extensions view.`,
          safeToAutoApply: false,
          requiresReload: false,
          sourceMetadata: {
            language: lang,
            conflictingExtensions: extIds,
            ruleId: this.id,
          },
        });

        findings.push(
          createFinding({
            ruleId: this.id,
            target: lang,
            category: 'extension',
            severity: hasActive ? 'medium' : 'low',
            confidence: 'medium', // Never misleadingly high; heuristic without CPU measurement
            title: `Possible extension capability overlap for "${lang}"`,
            summary: `Multiple installed extensions (${extIds.join(', ')}) contribute language features or activation for "${lang}". This may cause duplicate language servers or overlapping providers.`,
            evidence,
            recommendation: rec,
            detector: 'ExtensionConflictDetector',
            details: {
              language: lang,
              extensions: extIds,
              attribution: 'unmeasured',
            },
          })
        );
      }
    }

    return findings;
  }
}

export const extensionConflictRule = new ExtensionConflictRule();
