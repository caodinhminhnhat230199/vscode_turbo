export interface SettingPatch {
  section: string;
  before: unknown;
  after: unknown;
  addedKeys: string[];
  removedKeys: string[];
  modifiedKeys: string[];
  target: 'workspace' | 'global' | 'workspaceFolder';
}

export interface DiffResult {
  hasChanges: boolean;
  humanReadable: string;
  patch: SettingPatch;
  isValid: boolean;
  validationError?: string;
}

export class SettingsDiff {
  /**
   * Merges two exclude settings dictionaries while preserving all unrelated existing keys.
   */
  public static mergeExcludes(
    current: Record<string, unknown> | undefined,
    additions: Record<string, unknown>
  ): Record<string, unknown> {
    const base = current ? { ...current } : {};
    for (const [key, value] of Object.entries(additions)) {
      base[key] = value;
    }
    return base;
  }

  /**
   * Computes a structured patch and human-readable diff between before and after values.
   */
  public static computeDiff(
    section: string,
    before: unknown,
    after: unknown,
    target: 'workspace' | 'global' | 'workspaceFolder' = 'workspace'
  ): DiffResult {
    const addedKeys: string[] = [];
    const removedKeys: string[] = [];
    const modifiedKeys: string[] = [];
    const lines: string[] = [`Settings diff for "${section}":`];

    if (!section || typeof section !== 'string') {
      return {
        hasChanges: false,
        humanReadable: 'Invalid section name',
        patch: { section, before, after, addedKeys, removedKeys, modifiedKeys, target },
        isValid: false,
        validationError: 'Section name cannot be empty',
      };
    }

    if (
      before &&
      after &&
      typeof before === 'object' &&
      typeof after === 'object' &&
      !Array.isArray(before) &&
      !Array.isArray(after)
    ) {
      const beforeObj = before as Record<string, unknown>;
      const afterObj = after as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

      for (const key of allKeys) {
        const inBefore = key in beforeObj;
        const inAfter = key in afterObj;

        if (!inBefore && inAfter) {
          addedKeys.push(key);
          lines.push(`+ "${key}": ${JSON.stringify(afterObj[key])}`);
        } else if (inBefore && !inAfter) {
          removedKeys.push(key);
          lines.push(`- "${key}": ${JSON.stringify(beforeObj[key])}`);
        } else if (JSON.stringify(beforeObj[key]) !== JSON.stringify(afterObj[key])) {
          modifiedKeys.push(key);
          lines.push(
            `~ "${key}": ${JSON.stringify(beforeObj[key])} -> ${JSON.stringify(afterObj[key])}`
          );
        }
      }
    } else {
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        modifiedKeys.push(section);
        lines.push(`- ${JSON.stringify(before)}`);
        lines.push(`+ ${JSON.stringify(after)}`);
      }
    }

    const hasChanges = addedKeys.length > 0 || removedKeys.length > 0 || modifiedKeys.length > 0;

    return {
      hasChanges,
      humanReadable: lines.join('\n'),
      patch: {
        section,
        before,
        after,
        addedKeys,
        removedKeys,
        modifiedKeys,
        target,
      },
      isValid: true,
    };
  }

  /**
   * Validates a patch to ensure safety before application.
   */
  public static validatePatch(patch: SettingPatch): { isValid: boolean; error?: string } {
    if (!patch.section || typeof patch.section !== 'string') {
      return { isValid: false, error: 'Setting section is required.' };
    }
    try {
      JSON.stringify(patch.after);
    } catch {
      return { isValid: false, error: 'Proposed value is not JSON-serializable.' };
    }
    return { isValid: true };
  }
}
