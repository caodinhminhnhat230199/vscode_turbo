import * as fs from 'fs';
import * as path from 'path';
import { DetectedProject, ProjectDetector } from './ProjectDetector';

export class PythonProjectDetector implements ProjectDetector {
  public readonly name = 'Python';

  public async detect(rootPath: string): Promise<DetectedProject | null> {
    const indicators: string[] = [];
    const filesToCheck = [
      'pyproject.toml',
      'requirements.txt',
      'Pipfile',
      'setup.py',
      'setup.cfg',
      'environment.yml',
    ];

    let detectedFramework: string | undefined;

    for (const file of filesToCheck) {
      const filePath = path.join(rootPath, file);
      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
        indicators.push(file);

        if (!detectedFramework) {
          const content = await fs.promises.readFile(filePath, 'utf8');
          if (/django/i.test(content)) {
            detectedFramework = 'Django';
          } else if (/fastapi/i.test(content)) {
            detectedFramework = 'FastAPI';
          } else if (/flask/i.test(content)) {
            detectedFramework = 'Flask';
          }
        }
      } catch {
        // file missing
      }
    }

    if (indicators.length > 0) {
      return {
        language: 'Python',
        framework: detectedFramework,
        confidence: 'high',
        rootPath,
        indicators,
      };
    }

    return null;
  }
}
