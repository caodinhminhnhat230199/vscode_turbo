import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Android Studio Keymap Preset Configuration', () => {
  const packageJsonPath = path.resolve(__dirname, '../../../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  it('configures Android Studio keymap as default with opt-out option', () => {
    const properties = packageJson.contributes.configuration.properties;
    const keymapConfig = properties['vsturbo.search.keymap'];
    expect(keymapConfig).toBeDefined();
    expect(keymapConfig.enum).toContain('off');
    expect(keymapConfig.enum).toContain('androidStudio');
    expect(keymapConfig.default).toBe('androidStudio');

    const nativeQuickPickConfig = properties['vsturbo.search.useNativeQuickPick'];
    expect(nativeQuickPickConfig).toBeDefined();
    expect(nativeQuickPickConfig.default).toBe(true);

    const dialogModeConfig = properties['vsturbo.search.dialogMode'];
    expect(dialogModeConfig).toBeDefined();
    expect(dialogModeConfig.default).toBe('floatingDialog');
  });

  it('declares Android Studio keybindings with conditional when clause', () => {
    const keybindings = packageJson.contributes.keybindings;
    expect(Array.isArray(keybindings)).toBe(true);

    const everywhereBinding = keybindings.find(
      (k: any) => k.command === 'vsturbo.searchEverywhere' && k.key === 'ctrl+o'
    );
    expect(everywhereBinding).toBeDefined();
    expect(everywhereBinding.key).toBe('ctrl+o');
    expect(everywhereBinding.mac).toBe('cmd+o');

    const classBinding = keybindings.find((k: any) => k.command === 'vsturbo.searchClass');
    expect(classBinding).toBeDefined();
    expect(classBinding.key).toBe('ctrl+n');
    expect(classBinding.when).toContain("config.vsturbo.search.keymap == 'androidStudio'");

    const fileBinding = keybindings.find((k: any) => k.command === 'vsturbo.searchFile');
    expect(fileBinding).toBeDefined();
    expect(fileBinding.key).toBe('ctrl+shift+n');
    expect(fileBinding.mac).toBe('cmd+shift+o');
    expect(fileBinding.when).toContain("config.vsturbo.search.keymap == 'androidStudio'");

    const symbolBinding = keybindings.find((k: any) => k.command === 'vsturbo.searchSymbol');
    expect(symbolBinding).toBeDefined();
    expect(symbolBinding.key).toBe('ctrl+alt+shift+n');
    expect(symbolBinding.mac).toBe('cmd+alt+o');
    expect(symbolBinding.when).toContain("config.vsturbo.search.keymap == 'androidStudio'");

    const textBinding = keybindings.find((k: any) => k.command === 'vsturbo.searchText');
    expect(textBinding).toBeDefined();
    expect(textBinding.key).toBe('ctrl+shift+f');
    expect(textBinding.mac).toBe('cmd+shift+f');
    expect(textBinding.when).toContain("config.vsturbo.search.keymap == 'androidStudio'");

    const actionsBinding = keybindings.find((k: any) => k.command === 'vsturbo.searchActions');
    expect(actionsBinding).toBeDefined();
    expect(actionsBinding.key).toBe('ctrl+shift+a');
    expect(actionsBinding.mac).toBe('cmd+shift+a');
    expect(actionsBinding.when).toContain("config.vsturbo.search.keymap == 'androidStudio'");
  });
});
