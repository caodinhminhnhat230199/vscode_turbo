export type Confidence = 'low' | 'medium' | 'high';

export interface DetectedProject {
  language: string;
  framework?: string;
  confidence: Confidence;
  rootPath: string;
  indicators: string[];
}

export interface ProjectDetector {
  readonly name: string;
  detect(rootPath: string): Promise<DetectedProject | null>;
}
