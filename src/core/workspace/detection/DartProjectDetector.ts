import * as fs from 'fs';
import * as path from 'path';
import { DetectedProject, ProjectDetector } from './ProjectDetector';

export class DartProjectDetector implements ProjectDetector {
  public readonly name = 'Dart/Flutter';

  public async detect(rootPath: string): Promise<DetectedProject | null> {
    const indicators: string[] = [];
    const pubspecPath = path.join(rootPath, 'pubspec.yaml');
    const analysisOptionsPath = path.join(rootPath, 'analysis_options.yaml');
    const libPath = path.join(rootPath, 'lib');

    let hasPubspec = false;
    let isFlutter = false;

    try {
      await fs.promises.access(pubspecPath, fs.constants.R_OK);
      hasPubspec = true;
      indicators.push('pubspec.yaml');

      // Read small portion to check flutter dependency
      const content = await fs.promises.readFile(pubspecPath, 'utf8');
      if (/(^|\n)\s*flutter:\s*|sdk:\s*flutter/i.test(content)) {
        isFlutter = true;
        indicators.push('flutter sdk dependency');
      }
    } catch {
      // pubspec.yaml not found or not readable
    }

    try {
      await fs.promises.access(analysisOptionsPath, fs.constants.R_OK);
      indicators.push('analysis_options.yaml');
    } catch {
      // analysis_options.yaml not found
    }

    try {
      const stat = await fs.promises.stat(libPath);
      if (stat.isDirectory()) {
        indicators.push('lib/');
      }
    } catch {
      // lib/ not found
    }

    if (hasPubspec) {
      return {
        language: 'Dart',
        framework: isFlutter ? 'Flutter' : undefined,
        confidence: 'high',
        rootPath,
        indicators,
      };
    }

    if (indicators.length > 0) {
      return {
        language: 'Dart',
        confidence: indicators.length >= 2 ? 'medium' : 'low',
        rootPath,
        indicators,
      };
    }

    return null;
  }
}
