import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../../../src/core/events/EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('subscribes and receives emitted events', () => {
    let receivedPayload: any = null;
    const unsubscribe = eventBus.on('workspaceChanged', (data) => {
      receivedPayload = data;
    });

    const testSummary = {
      folderCount: 1,
      totalFiles: 10,
      sourceFiles: 8,
      generatedFiles: 2,
      languages: { typescript: 8 },
      frameworks: [],
    };

    eventBus.emit('workspaceChanged', { summary: testSummary });
    expect(receivedPayload).toEqual({ summary: testSummary });

    // Test unsubscribe
    receivedPayload = null;
    unsubscribe();
    eventBus.emit('workspaceChanged', { summary: testSummary });
    expect(receivedPayload).toBeNull();
  });

  it('handles errors inside listeners without crashing', () => {
    eventBus.on('configurationChanged', () => {
      throw new Error('Listener error');
    });

    let secondListenerCalled = false;
    eventBus.on('configurationChanged', () => {
      secondListenerCalled = true;
    });

    expect(() => {
      eventBus.emit('configurationChanged', { key: 'test', value: 123 });
    }).not.toThrow();

    expect(secondListenerCalled).toBe(true);
  });
});
