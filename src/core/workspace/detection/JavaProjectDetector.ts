import * as fs from 'fs';
import * as path from 'path';
import { DetectedProject, ProjectDetector } from './ProjectDetector';

export class JavaProjectDetector implements ProjectDetector {
  public readonly name = 'Java';

  public async detect(rootPath: string): Promise<DetectedProject | null> {
    const indicators: string[] = [];
    const pomPath = path.join(rootPath, 'pom.xml');
    const gradleGroovyPath = path.join(rootPath, 'build.gradle');
    const gradleKtsPath = path.join(rootPath, 'build.gradle.kts');
    const settingsGradlePath = path.join(rootPath, 'settings.gradle');
    const srcMainJavaPath = path.join(rootPath, 'src', 'main', 'java');

    let framework: string | undefined;

    try {
      await fs.promises.access(pomPath, fs.constants.R_OK);
      indicators.push('pom.xml');
      framework = 'Maven';

      const content = await fs.promises.readFile(pomPath, 'utf8');
      if (/spring-boot/i.test(content)) {
        framework = 'Spring Boot (Maven)';
      }
    } catch {
      // pom.xml missing
    }

    try {
      await fs.promises.access(gradleGroovyPath, fs.constants.R_OK);
      indicators.push('build.gradle');
      framework = framework ?? 'Gradle';
    } catch {
      // build.gradle missing
    }

    try {
      await fs.promises.access(gradleKtsPath, fs.constants.R_OK);
      indicators.push('build.gradle.kts');
      framework = framework ?? 'Gradle';
    } catch {
      // build.gradle.kts missing
    }

    try {
      await fs.promises.access(settingsGradlePath, fs.constants.R_OK);
      indicators.push('settings.gradle');
    } catch {
      // settings.gradle missing
    }

    try {
      const stat = await fs.promises.stat(srcMainJavaPath);
      if (stat.isDirectory()) {
        indicators.push('src/main/java');
      }
    } catch {
      // src/main/java missing
    }

    if (indicators.some((ind) => ind.includes('pom.xml') || ind.includes('build.gradle'))) {
      return {
        language: 'Java',
        framework,
        confidence: 'high',
        rootPath,
        indicators,
      };
    }

    if (indicators.length > 0) {
      return {
        language: 'Java',
        framework,
        confidence: 'medium',
        rootPath,
        indicators,
      };
    }

    return null;
  }
}
