import { JobPriority } from './JobTypes';

export interface ResourceGovernorListener {
  onPauseChange?: (priority: JobPriority, paused: boolean, reason: string) => void;
  onWorkerLimitChange?: (newLimit: number) => void;
}

export class ResourceGovernor {
  private activeSearches = 0;
  private isUserTyping = false;
  private typingTimer?: NodeJS.Timeout;
  private readonly pausedPriorities = new Set<JobPriority>();
  private listeners: ResourceGovernorListener[] = [];

  public addListener(listener: ResourceGovernorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public notifySearchStarted(): void {
    this.activeSearches++;
    if (this.activeSearches === 1) {
      this.applySearchPolicy(true);
    }
  }

  public notifySearchEnded(): void {
    this.activeSearches = Math.max(0, this.activeSearches - 1);
    if (this.activeSearches === 0) {
      this.applySearchPolicy(false);
    }
  }

  public notifyUserTyping(debounceMs = 1000): void {
    this.isUserTyping = true;
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }
    this.applyTypingPolicy(true);

    this.typingTimer = setTimeout(() => {
      this.isUserTyping = false;
      this.applyTypingPolicy(false);
    }, debounceMs);
  }

  private applySearchPolicy(active: boolean): void {
    // Under active interactive search, deprioritize or pause background work (P4, P5, P6)
    const backgroundPriorities = [
      JobPriority.P4_WARMUP,
      JobPriority.P5_BACKGROUND_INDEX,
      JobPriority.P6_MAINTENANCE,
    ];

    for (const priority of backgroundPriorities) {
      if (active) {
        if (!this.pausedPriorities.has(priority)) {
          this.pausedPriorities.add(priority);
          this.emitPauseChange(priority, true, 'interactive_search_active');
        }
      } else {
        if (this.pausedPriorities.has(priority) && !this.isUserTyping) {
          this.pausedPriorities.delete(priority);
          this.emitPauseChange(priority, false, 'search_idle');
        }
      }
    }
  }

  private applyTypingPolicy(typing: boolean): void {
    if (typing) {
      if (!this.pausedPriorities.has(JobPriority.P6_MAINTENANCE)) {
        this.pausedPriorities.add(JobPriority.P6_MAINTENANCE);
        this.emitPauseChange(JobPriority.P6_MAINTENANCE, true, 'user_typing');
      }
    } else {
      if (this.activeSearches === 0) {
        if (this.pausedPriorities.has(JobPriority.P6_MAINTENANCE)) {
          this.pausedPriorities.delete(JobPriority.P6_MAINTENANCE);
          this.emitPauseChange(JobPriority.P6_MAINTENANCE, false, 'typing_idle');
        }
      }
    }
  }

  private emitPauseChange(priority: JobPriority, paused: boolean, reason: string): void {
    for (const listener of this.listeners) {
      listener.onPauseChange?.(priority, paused, reason);
    }
  }

  public isPriorityPaused(priority: JobPriority): boolean {
    return this.pausedPriorities.has(priority);
  }

  public getPausedPriorities(): JobPriority[] {
    return Array.from(this.pausedPriorities);
  }

  public dispose(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = undefined;
    }
    this.listeners = [];
    this.pausedPriorities.clear();
  }
}
