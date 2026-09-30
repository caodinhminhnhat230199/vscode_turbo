import * as vscode from 'vscode';
import { VsTurboConfig } from '../../vscode/config';

export interface IConfigurationService {
  initialize(context: vscode.ExtensionContext): void;
  getConfig(): VsTurboConfig;
  get<T>(section: string, defaultValue?: T): T;
  update(section: string, value: unknown, target?: vscode.ConfigurationTarget): Promise<void>;
  onDidChangeConfig(listener: (config: VsTurboConfig) => void): vscode.Disposable;
}
