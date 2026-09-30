import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { stateStore } from '../../../src/core/state/StateStore';
import { applyRecommendationService } from '../../../src/optimizer/ApplyRecommendation';
import { registerCommands } from '../../../src/vscode/commands';
import { createRecommendation } from '../../../src/diagnostics/model/Recommendation';
import { PerformanceFinding } from '../../../src/diagnostics/model/Finding';

describe('vsturbo.applyAllRecommendations command', () => {
  beforeEach(() => {
    stateStore.updateFindings([]);
    applyRecommendationService.clearHistory();
    vi.restoreAllMocks();
  });

  it('notifies when there are no actionable recommendations to approve', async () => {
    const infoSpy = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue(undefined as any);
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerCommands(context);

    await vscode.commands.executeCommand('vsturbo.applyAllRecommendations');

    expect(infoSpy).toHaveBeenCalledWith('VS Turbo: No recommendations to approve.');
  });

  it('approves and applies all actionable recommendations', async () => {
    const infoSpy = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue('Approve All' as any);
    const applyAllSpy = vi.spyOn(applyRecommendationService, 'applyAll').mockResolvedValue({
      success: true,
      appliedCount: 2,
      message: 'Successfully applied 2 of 2 recommendations.',
    });

    const rec1 = createRecommendation({
      id: 'REC_1',
      type: 'workspaceSetting',
      title: 'Rec 1',
      description: 'Desc 1',
      safeToAutoApply: true,
      changes: [
        {
          section: 'files.watcherExclude',
          oldValue: {},
          newValue: { '**/dist/**': true },
          description: 'Exclude',
        },
      ],
    });
    const rec2 = createRecommendation({
      id: 'REC_2',
      type: 'workspaceSetting',
      title: 'Rec 2',
      description: 'Desc 2',
      safeToAutoApply: true,
      changes: [
        {
          section: 'search.exclude',
          oldValue: {},
          newValue: { '**/build/**': true },
          description: 'Exclude',
        },
      ],
    });

    const findings: PerformanceFinding[] = [
      {
        id: 'F1',
        category: 'filesystem',
        severity: 'high',
        title: 'Finding 1',
        summary: 'Summary 1',
        confidence: 'high',
        evidence: [],
        recommendation: rec1,
        createdAt: Date.now(),
      },
      {
        id: 'F2',
        category: 'search',
        severity: 'medium',
        title: 'Finding 2',
        summary: 'Summary 2',
        confidence: 'high',
        evidence: [],
        recommendation: rec2,
        createdAt: Date.now(),
      },
    ];

    stateStore.updateFindings(findings);

    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerCommands(context);

    await vscode.commands.executeCommand('vsturbo.applyAllRecommendations');

    expect(applyAllSpy).toHaveBeenCalledWith([rec1, rec2], expect.any(Object));
    expect(infoSpy).toHaveBeenCalledWith('VS Turbo: Successfully applied 2 of 2 recommendations.');
  });
});
