import { DetectedProject, ProjectDetector } from './ProjectDetector';
import { DartProjectDetector } from './DartProjectDetector';
import { NodeProjectDetector } from './NodeProjectDetector';
import { JavaProjectDetector } from './JavaProjectDetector';
import { PythonProjectDetector } from './PythonProjectDetector';

export class CompositeProjectDetector {
  private detectors: ProjectDetector[] = [];

  constructor(customDetectors?: ProjectDetector[]) {
    if (customDetectors) {
      this.detectors = [...customDetectors];
    } else {
      this.detectors = [
        new DartProjectDetector(),
        new NodeProjectDetector(),
        new JavaProjectDetector(),
        new PythonProjectDetector(),
      ];
    }
  }

  public registerDetector(detector: ProjectDetector): void {
    this.detectors.push(detector);
  }

  public async detectFolder(rootPath: string): Promise<DetectedProject[]> {
    const results = await Promise.all(this.detectors.map((d) => d.detect(rootPath)));
    return results.filter((r): r is DetectedProject => r !== null);
  }

  public async detectWorkspace(rootPaths: string[]): Promise<Map<string, DetectedProject[]>> {
    const map = new Map<string, DetectedProject[]>();
    for (const root of rootPaths) {
      const detected = await this.detectFolder(root);
      map.set(root, detected);
    }
    return map;
  }

  public summarize(detectedList: DetectedProject[]): {
    languages: Record<string, number>;
    frameworks: string[];
    primaryLanguage?: string;
  } {
    const languages: Record<string, number> = {};
    const frameworkSet = new Set<string>();

    for (const item of detectedList) {
      languages[item.language] = (languages[item.language] || 0) + 1;
      if (item.framework) {
        frameworkSet.add(item.framework);
      }
    }

    let primaryLanguage: string | undefined;
    let maxCount = -1;
    for (const [lang, count] of Object.entries(languages)) {
      if (count > maxCount) {
        maxCount = count;
        primaryLanguage = lang;
      }
    }

    return {
      languages,
      frameworks: Array.from(frameworkSet),
      primaryLanguage,
    };
  }
}

export const compositeProjectDetector = new CompositeProjectDetector();
