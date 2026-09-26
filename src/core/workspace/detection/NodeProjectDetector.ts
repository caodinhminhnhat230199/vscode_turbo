import * as fs from 'fs';
import * as path from 'path';
import { DetectedProject, ProjectDetector } from './ProjectDetector';

export class NodeProjectDetector implements ProjectDetector {
  public readonly name = 'Node/TypeScript';

  public async detect(rootPath: string): Promise<DetectedProject | null> {
    const indicators: string[] = [];
    const packageJsonPath = path.join(rootPath, 'package.json');
    const tsconfigPath = path.join(rootPath, 'tsconfig.json');
    const jsconfigPath = path.join(rootPath, 'jsconfig.json');

    let hasPackageJson = false;
    let hasTsConfig = false;
    let detectedFramework: string | undefined;

    try {
      await fs.promises.access(packageJsonPath, fs.constants.R_OK);
      hasPackageJson = true;
      indicators.push('package.json');

      const raw = await fs.promises.readFile(packageJsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      const deps = { ...parsed.dependencies, ...parsed.devDependencies };

      if (deps['next']) {
        detectedFramework = 'Next.js';
      } else if (deps['react']) {
        detectedFramework = 'React';
      } else if (deps['vue'] || deps['nuxt']) {
        detectedFramework = deps['nuxt'] ? 'Nuxt' : 'Vue';
      } else if (deps['@angular/core']) {
        detectedFramework = 'Angular';
      } else if (deps['@nestjs/core']) {
        detectedFramework = 'NestJS';
      } else if (deps['express']) {
        detectedFramework = 'Express';
      } else if (deps['vscode'] || deps['@types/vscode']) {
        detectedFramework = 'VS Code Extension';
      }
    } catch {
      // package.json missing or invalid JSON
    }

    try {
      await fs.promises.access(tsconfigPath, fs.constants.R_OK);
      hasTsConfig = true;
      indicators.push('tsconfig.json');
    } catch {
      // tsconfig missing
    }

    try {
      await fs.promises.access(jsconfigPath, fs.constants.R_OK);
      indicators.push('jsconfig.json');
    } catch {
      // jsconfig missing
    }

    if (hasPackageJson || hasTsConfig) {
      return {
        language: hasTsConfig ? 'TypeScript' : 'JavaScript',
        framework: detectedFramework,
        confidence: 'high',
        rootPath,
        indicators,
      };
    }

    if (indicators.length > 0) {
      return {
        language: 'JavaScript',
        framework: detectedFramework,
        confidence: 'medium',
        rootPath,
        indicators,
      };
    }

    return null;
  }
}
