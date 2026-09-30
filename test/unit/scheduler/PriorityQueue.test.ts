import { describe, it, expect, beforeEach } from 'vitest';
import { PriorityQueue } from '../../../src/scheduler/PriorityQueue';
import { JobPriority, ScheduledJob } from '../../../src/scheduler/JobTypes';

function makeJob(id: string, priority: JobPriority, groupId?: string): ScheduledJob<string> {
  return {
    id,
    groupId,
    priority,
    type: 'search_file',
    execute: async () => id,
  };
}

describe('PriorityQueue', () => {
  let queue: PriorityQueue;

  beforeEach(() => {
    queue = new PriorityQueue();
  });

  it('orders jobs strictly by priority (P0 before P4)', () => {
    queue.enqueue(makeJob('job-warmup', JobPriority.P4_WARMUP));
    queue.enqueue(makeJob('job-bg', JobPriority.P5_BACKGROUND_INDEX));
    queue.enqueue(makeJob('job-search', JobPriority.P0_INTERACTIVE_SEARCH));
    queue.enqueue(makeJob('job-nav', JobPriority.P1_NAVIGATION));

    expect(queue.size).toBe(4);
    expect(queue.dequeue()?.id).toBe('job-search');
    expect(queue.dequeue()?.id).toBe('job-nav');
    expect(queue.dequeue()?.id).toBe('job-warmup');
    expect(queue.dequeue()?.id).toBe('job-bg');
    expect(queue.dequeue()).toBeUndefined();
  });

  it('maintains FIFO order within the same priority level', () => {
    queue.enqueue(makeJob('s1', JobPriority.P0_INTERACTIVE_SEARCH));
    queue.enqueue(makeJob('s2', JobPriority.P0_INTERACTIVE_SEARCH));
    queue.enqueue(makeJob('s3', JobPriority.P0_INTERACTIVE_SEARCH));

    expect(queue.dequeue()?.id).toBe('s1');
    expect(queue.dequeue()?.id).toBe('s2');
    expect(queue.dequeue()?.id).toBe('s3');
  });

  it('removes jobs by ID and by group ID', () => {
    queue.enqueue(makeJob('j1', JobPriority.P2_INCREMENTAL_INDEX, 'group-A'));
    queue.enqueue(makeJob('j2', JobPriority.P2_INCREMENTAL_INDEX, 'group-A'));
    queue.enqueue(makeJob('j3', JobPriority.P3_USER_TRIGGERED_DIAGNOSTIC, 'group-B'));

    expect(queue.remove('j3')).toBe(true);
    expect(queue.has('j3')).toBe(false);
    expect(queue.size).toBe(2);

    const removedCount = queue.removeByGroup('group-A');
    expect(removedCount).toBe(2);
    expect(queue.isEmpty()).toBe(true);
  });

  it('reprioritizes an existing job in queue', () => {
    queue.enqueue(makeJob('job1', JobPriority.P5_BACKGROUND_INDEX));
    queue.enqueue(makeJob('job2', JobPriority.P4_WARMUP));

    expect(queue.reprioritize('job1', JobPriority.P0_INTERACTIVE_SEARCH)).toBe(true);
    expect(queue.dequeue()?.id).toBe('job1');
    expect(queue.dequeue()?.id).toBe('job2');
  });

  it('respects ignored/paused priorities when dequeuing', () => {
    queue.enqueue(makeJob('p4', JobPriority.P4_WARMUP));
    queue.enqueue(makeJob('p5', JobPriority.P5_BACKGROUND_INDEX));

    const paused = new Set<JobPriority>([JobPriority.P4_WARMUP]);
    expect(queue.dequeue(paused)?.id).toBe('p5');
    expect(queue.dequeue(paused)).toBeUndefined();
    expect(queue.size).toBe(1);
    expect(queue.dequeue()?.id).toBe('p4');
  });
});
