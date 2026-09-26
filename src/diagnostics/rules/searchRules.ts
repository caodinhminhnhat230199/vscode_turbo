import { DiagnosticContext, DiagnosticRule } from './ruleTypes';
import { PerformanceFinding, createFinding } from '../model/Finding';
import { createEvidence } from '../model/Evidence';
import { createRecommendation } from '../model/Recommendation';
import { excludeSettingsReader } from '../../core/workspace/excludes/ExcludeSettingsReader';

export class SearchRule001 implements DiagnosticRule {
  public readonly id = 'SEARCH_001';
  public readonly name = 'Generated folder not search-excluded';

  public evaluate(context: DiagnosticContext): PerformanceFinding[] {
    const findings: PerformanceFinding[] = [];
    const buildFolders = context.scanResult.detectedBuildFolders;

    for (const folder of buildFolders) {
      // In VS Code, search respects search.exclude AND files.exclude by default
      const isSearchExcluded = excludeSettingsReader.isFolderExcluded(
        folder,
        context.excludes.searchExclude
      );
      const isFilesExcluded = excludeSettingsReader.isFolderExcluded(
        folder,
        context.excludes.filesExclude
      );

      if (!isSearchExcluded && !isFilesExcluded) {
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
          createEvidence('Directory Path', folder, 'SEARCH_001'),
          createEvidence(
            'Significant File Count',
            folderFiles > 0 ? folderFiles : 'Significant',
            'SearchDiagnostic',
            'files'
          ),
          createEvidence('Estimated Workspace Share', `${estimatedPct}%`, 'SearchDiagnostic', '%'),
          createEvidence(
            'Active Search Excludes Count',
            context.excludes.searchExclude.activePatterns.length,
            'ExcludeSettingsReader',
            'patterns'
          ),
        ];

        const recommendation = createRecommendation({
          id: `REC_SEARCH_${folder.toUpperCase()}`,
          type: 'workspaceSetting',
          title: `Exclude "${folder}" from workspace search`,
          description: `Add ${pattern} to search.exclude to accelerate text and symbol search operations.`,
          safeToAutoApply: true,
          requiresReload: false,
          changes: [
            {
              section: 'search.exclude',
              oldValue: context.excludes.searchExclude.effective,
              newValue: {
                ...context.excludes.searchExclude.effective,
                [pattern]: true,
              },
              description: `Add ${pattern} to search.exclude`,
              target: 'workspace',
            },
          ],
          sourceMetadata: { folder, ruleId: this.id },
        });

        findings.push(
          createFinding({
            ruleId: this.id,
            target: folder,
            category: 'search',
            severity: 'medium',
            confidence: 'high',
            title: `Generated directory "${folder}" is not excluded from search`,
            summary: `Directory "${folder}" contains generated code or artifacts but is included in workspace text and symbol searches. This clutters search results and increases search latency.`,
            evidence,
            recommendation,
            detector: 'SearchDiagnostic',
            details: { folder, suggestedPattern: pattern },
          })
        );
      }
    }

    return findings;
  }
}

export const searchRule001 = new SearchRule001();
