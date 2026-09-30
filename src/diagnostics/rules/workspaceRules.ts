import { DiagnosticContext, DiagnosticRule } from './ruleTypes';
import { PerformanceFinding, createFinding } from '../model/Finding';
import { createEvidence } from '../model/Evidence';
import { createRecommendation } from '../model/Recommendation';

export class WorkspaceRule001 implements DiagnosticRule {
  public readonly id = 'WORKSPACE_001';
  public readonly name = 'Very high file count';

  public evaluate(context: DiagnosticContext): PerformanceFinding[] {
    const threshold = context.thresholds?.highFileCount ?? 30000;
    const totalFiles = context.scanResult.totalFiles;

    if (totalFiles > threshold) {
      const evidence = [
        createEvidence('Total Files', totalFiles, 'WorkspaceScanner', 'files'),
        createEvidence('Warning Threshold', threshold, 'WORKSPACE_001', 'files'),
        createEvidence(
          'Total Directories',
          context.scanResult.totalDirectories,
          'WorkspaceScanner',
          'dirs'
        ),
      ];

      const recommendation = createRecommendation({
        id: 'REC_WORKSPACE_HIGH_FILE_COUNT',
        type: 'manualAction',
        title: 'Review workspace structure and exclude heavy assets',
        description:
          'Workspace contains more than 30k files. Consider excluding large data directories or breaking into multi-root workspaces.',
        safeToAutoApply: false,
        requiresReload: false,
      });

      return [
        createFinding({
          ruleId: this.id,
          category: 'workspace',
          severity: 'high',
          confidence: 'high',
          title: `Very high file count detected (${totalFiles.toLocaleString()} files)`,
          summary: `The workspace contains ${totalFiles.toLocaleString()} files, exceeding the recommended performance threshold of ${threshold.toLocaleString()}. High file counts degrade extension host responsiveness and language server indexing.`,
          evidence,
          recommendation,
          detector: 'WorkspaceDiagnostic',
          details: { totalFiles, threshold },
        }),
      ];
    }

    return [];
  }
}

export class WorkspaceRule002 implements DiagnosticRule {
  public readonly id = 'WORKSPACE_002';
  public readonly name = 'Excessive generated-file ratio';

  public evaluate(context: DiagnosticContext): PerformanceFinding[] {
    const thresholdRatio = context.thresholds?.excessiveGeneratedRatio ?? 0.35;
    const totalFiles = context.scanResult.totalFiles;
    const generatedCount = context.generatedSourceCount ?? 0;

    if (totalFiles >= 50 && generatedCount > 0) {
      const ratio = generatedCount / totalFiles;
      if (ratio > thresholdRatio) {
        const percentage = Math.round(ratio * 100);
        const evidence = [
          createEvidence('Generated Source Files', generatedCount, 'FileClassifier', 'files'),
          createEvidence('Total Workspace Files', totalFiles, 'WorkspaceScanner', 'files'),
          createEvidence('Generated Ratio', percentage, 'WORKSPACE_002', '%'),
          createEvidence('Threshold', Math.round(thresholdRatio * 100), 'WORKSPACE_002', '%'),
        ];

        const recommendation = createRecommendation({
          id: 'REC_WORKSPACE_EXCESSIVE_GENERATED',
          type: 'vsTurboSetting',
          title: 'Disable indexing of generated files',
          description:
            'Set vsturbo.index.generatedFiles to false to prevent indexing overhead for generated source code.',
          safeToAutoApply: true,
          requiresReload: false,
          changes: [
            {
              section: 'vsturbo.index.generatedFiles',
              oldValue: true,
              newValue: false,
              description: 'Disable indexing of generated files',
              target: 'workspace',
            },
          ],
        });

        return [
          createFinding({
            ruleId: this.id,
            category: 'workspace',
            severity: 'medium',
            confidence: 'medium',
            title: `Excessive ratio of generated files (${percentage}%)`,
            summary: `${percentage}% of files in this workspace are generated code (${generatedCount} of ${totalFiles}). Excessive generated files can saturate symbol lookups and background warmup tasks.`,
            evidence,
            recommendation,
            detector: 'WorkspaceDiagnostic',
            details: { generatedCount, totalFiles, ratio },
          }),
        ];
      }
    }

    return [];
  }
}

export const workspaceRule001 = new WorkspaceRule001();
export const workspaceRule002 = new WorkspaceRule002();
