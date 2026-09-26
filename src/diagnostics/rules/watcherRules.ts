import { DiagnosticContext, DiagnosticRule } from './ruleTypes';
import { PerformanceFinding, createFinding } from '../model/Finding';
import { createEvidence } from '../model/Evidence';
import { createRecommendation } from '../model/Recommendation';
import { excludeSettingsReader } from '../../core/workspace/excludes/ExcludeSettingsReader';

export class WatcherRule001 implements DiagnosticRule {
  public readonly id = 'WATCHER_001';
  public readonly name = 'Generated folder not watcher-excluded';

  public evaluate(context: DiagnosticContext): PerformanceFinding[] {
    const findings: PerformanceFinding[] = [];
    const buildFolders = context.scanResult.detectedBuildFolders;

    for (const folder of buildFolders) {
      const isExcluded = excludeSettingsReader.isFolderExcluded(
        folder,
        context.excludes.watcherExclude
      );

      if (!isExcluded) {
        const totalFiles = context.scanResult.totalFiles || 0;
        const folderFiles =
          context.scanResult.largestFiles?.filter(
            (f) => f.path.includes(`/${folder}/`) || f.path.includes(`\\${folder}\\`)
          ).length ?? 0;
        const estimatedPct =
          totalFiles > 0
            ? Math.max(1, Math.min(100, Math.round((Math.max(folderFiles, 1) / totalFiles) * 100)))
            : 0;

        const pattern = `**/${folder}/**`;
        const evidence = [
          createEvidence('Directory Path', folder, 'WATCHER_001'),
          createEvidence(
            'Significant File Count',
            folderFiles > 0 ? folderFiles : 'Significant',
            'WatcherDiagnostic',
            'files'
          ),
          createEvidence('Estimated Workspace Share', `${estimatedPct}%`, 'WatcherDiagnostic', '%'),
          createEvidence(
            'Current Watcher Excludes Count',
            context.excludes.watcherExclude.activePatterns.length,
            'ExcludeSettingsReader',
            'patterns'
          ),
        ];

        const recommendation = createRecommendation({
          id: `REC_WATCHER_${folder.toUpperCase()}`,
          type: 'workspaceSetting',
          title: `Exclude "${folder}" from file watcher`,
          description: `Add ${pattern} to files.watcherExclude to reduce file system watcher CPU and memory load.`,
          safeToAutoApply: true,
          requiresReload: false,
          changes: [
            {
              section: 'files.watcherExclude',
              oldValue: context.excludes.watcherExclude.effective,
              newValue: {
                ...context.excludes.watcherExclude.effective,
                [pattern]: true,
              },
              description: `Add ${pattern} to files.watcherExclude`,
              target: 'workspace',
            },
          ],
          sourceMetadata: { folder, ruleId: this.id },
        });

        findings.push(
          createFinding({
            ruleId: this.id,
            target: folder,
            category: 'filesystem',
            severity: 'high',
            confidence: 'high',
            title: `Build directory "${folder}" is not excluded from file watcher`,
            summary: `Directory "${folder}" contains generated or build artifacts but is actively monitored by VS Code file watchers. This causes excessive file change events and CPU spikes.`,
            evidence,
            recommendation,
            detector: 'WatcherDiagnostic',
            details: { folder, suggestedPattern: pattern },
          })
        );
      }
    }

    return findings;
  }
}

export const watcherRule001 = new WatcherRule001();
