import * as path from 'path';
import { DiagnosticContext, DiagnosticRule } from './ruleTypes';
import { PerformanceFinding, createFinding } from '../model/Finding';
import { createEvidence } from '../model/Evidence';
import { createRecommendation } from '../model/Recommendation';
import { classifyFile } from '../../core/workspace/classification/FileClassifier';

export class FileRule001 implements DiagnosticRule {
  public readonly id = 'FILE_001';
  public readonly name = 'Very large source file';

  public evaluate(context: DiagnosticContext): PerformanceFinding[] {
    const thresholdBytes = context.thresholds?.largeFileSizeBytes ?? 1024 * 1024; // 1MB
    const findings: PerformanceFinding[] = [];

    for (const file of context.scanResult.largestFiles) {
      if (file.sizeBytes >= thresholdBytes) {
        const classification = classifyFile(file.path);
        // Flag only if it is a source file (not a binary or already recognized build artifact)
        if (classification.source) {
          const sizeKb = (file.sizeBytes / 1024).toFixed(1);
          const fileName = path.basename(file.path);

          const evidence = [
            createEvidence('File Path', file.path, 'FILE_001'),
            createEvidence('File Size', sizeKb, 'FILE_001', 'KB'),
            createEvidence('Threshold Size', (thresholdBytes / 1024).toFixed(0), 'FILE_001', 'KB'),
          ];

          const recommendation = createRecommendation({
            id: `REC_LARGE_FILE_${fileName.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase()}`,
            type: 'manualAction',
            title: `Review large source file: ${fileName}`,
            description: `File "${fileName}" exceeds 1MB. Consider splitting into smaller modules or adding exclude rules if generated.`,
            safeToAutoApply: false,
            requiresReload: false,
          });

          findings.push(
            createFinding({
              ruleId: this.id,
              target: file.path,
              category: 'filesystem',
              severity: 'medium',
              confidence: 'high',
              title: `Very large source file: ${fileName} (${sizeKb} KB)`,
              summary: `Source file "${fileName}" is ${sizeKb} KB. Monolithic source files cause high memory allocation and responsiveness delays during AST parsing and semantic tokenization.`,
              evidence,
              recommendation,
              detector: 'FileDiagnostic',
              details: { filePath: file.path, sizeBytes: file.sizeBytes },
            })
          );
        }
      }
    }

    return findings;
  }
}

export class FileRule002 implements DiagnosticRule {
  public readonly id = 'FILE_002';
  public readonly name = 'Excessive generated source';

  public evaluate(context: DiagnosticContext): PerformanceFinding[] {
    const threshold = context.thresholds?.excessiveGeneratedFilesCount ?? 200;
    const count = context.generatedSourceCount ?? 0;

    if (count > threshold) {
      const evidence = [
        createEvidence('Generated Source Files Count', count, 'FileClassifier', 'files'),
        createEvidence('Warning Threshold', threshold, 'FILE_002', 'files'),
      ];

      const recommendation = createRecommendation({
        id: 'REC_EXCESSIVE_GENERATED_FILES',
        type: 'codePulseSetting',
        title: 'Deprioritize generated files during warmup',
        description:
          'Configure CodePulse warmup and indexer to process hand-written files before generated code.',
        safeToAutoApply: true,
        requiresReload: false,
      });

      return [
        createFinding({
          ruleId: this.id,
          category: 'filesystem',
          severity: 'low',
          confidence: 'medium',
          title: `High volume of generated source files (${count} files)`,
          summary: `Workspace has ${count} generated code files (e.g. *.g.dart, *.freezed.dart, *.generated.ts). Large amounts of generated code can delay language server warmup and definition lookups.`,
          evidence,
          recommendation,
          detector: 'FileDiagnostic',
          details: { generatedSourceCount: count, threshold },
        }),
      ];
    }

    return [];
  }
}

export const fileRule001 = new FileRule001();
export const fileRule002 = new FileRule002();
