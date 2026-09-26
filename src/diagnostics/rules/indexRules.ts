import { DiagnosticContext, DiagnosticRule } from './ruleTypes';
import { PerformanceFinding, createFinding } from '../model/Finding';
import { createEvidence } from '../model/Evidence';
import { createRecommendation } from '../model/Recommendation';
import { OptimizationContext, OptimizationRule } from '../../optimizer/OptimizationRule';

export interface IndexChurnStats {
  invalidationsPerMinute?: number;
  reindexCount?: number;
  generatedFilesWatched?: string[];
}

export class IndexRule001 implements DiagnosticRule, OptimizationRule {
  public readonly id = 'INDEX_001';
  public readonly name = 'Excessive workspace re-indexing rate detected';

  public evaluate(context: DiagnosticContext | OptimizationContext): PerformanceFinding[] {
    const findings: PerformanceFinding[] = [];
    const stats: IndexChurnStats | undefined =
      (context as OptimizationContext).reindexStats ??
      (context as { reindexStats?: IndexChurnStats }).reindexStats;

    // Check 1: Explicit re-index stats (invalidations per minute or generated files watched)
    if (stats) {
      const invalidations = stats.invalidationsPerMinute ?? 0;
      const reindexes = stats.reindexCount ?? 0;
      const watched = stats.generatedFilesWatched ?? [];

      const isHighChurn = invalidations >= 10 || reindexes >= 5 || watched.length > 0;

      if (isHighChurn) {
        const evidence = [
          createEvidence(
            'Index Invalidations / Min',
            invalidations,
            'IndexChurnTracker',
            'events/min'
          ),
          createEvidence('Session Reindex Count', reindexes, 'IndexChurnTracker', 'cycles'),
        ];

        if (watched.length > 0) {
          evidence.push(
            createEvidence(
              'Generated Files Triggering Reindex',
              watched.slice(0, 5).join(', '),
              'IndexChurnTracker'
            )
          );
        }

        const changes = watched.map((f) => {
          const pattern = `**/${f}/**`;
          return {
            section: 'files.watcherExclude',
            oldValue: {},
            newValue: { [pattern]: true },
            description: `Exclude generated directory ${pattern} from watcher`,
            target: 'workspace' as const,
          };
        });

        findings.push(
          createFinding({
            ruleId: this.id,
            target: 'WorkspaceIndex',
            category: 'index',
            severity: invalidations > 20 ? 'critical' : 'high',
            confidence: 'high',
            title: 'Excessive workspace re-indexing churn detected',
            summary: `Workspace index is invalidating frequently (${invalidations} invalidations/min). Repeated changes in watched or generated files are causing high CPU overhead.`,
            evidence,
            recommendation: createRecommendation({
              id: 'REC_INDEX_EXCLUDE_GENERATED',
              type: 'codePulseSetting',
              title: 'Exclude high-churn generated folders from index and watcher',
              description:
                'Exclude active output directories and debounce rapid indexing events to reduce disk I/O and CPU usage.',
              safeToAutoApply: changes !== undefined && changes.length > 0,
              requiresReload: false,
              changes,
              sourceMetadata: {
                ruleId: this.id,
                invalidationsPerMinute: stats.invalidationsPerMinute,
              },
            }),
            detector: 'IndexEngine',
            details: {
              invalidationsPerMinute: stats.invalidationsPerMinute,
              reindexCount: stats.reindexCount,
              generatedFilesWatched: stats.generatedFilesWatched,
            },
          })
        );
      }
    }

    return findings;
  }
}

export const indexRule001 = new IndexRule001();
