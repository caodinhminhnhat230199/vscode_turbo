import { describe, it, expect, beforeEach } from 'vitest';
import { Logger, LogOutputChannel } from '../../../../src/core/logging/Logger';

class MockOutputChannel implements LogOutputChannel {
  public lines: string[] = [];
  appendLine(value: string): void {
    this.lines.push(value);
  }
}

describe('Logger', () => {
  let logger: Logger;
  let mockChannel: MockOutputChannel;

  beforeEach(() => {
    logger = new Logger();
    mockChannel = new MockOutputChannel();
    logger.setOutputChannel(mockChannel);
  });

  it('filters logs lower than set level', () => {
    logger.setLevel('warn');
    logger.debug('debug message');
    logger.info('info message');
    expect(mockChannel.lines.length).toBe(0);

    logger.warn('warn message');
    expect(mockChannel.lines.length).toBe(1);
    expect(mockChannel.lines[0]).toContain('[WARN]');
    expect(mockChannel.lines[0]).toContain('warn message');
  });

  it('formats structured context as JSON', () => {
    logger.setLevel('debug');
    logger.info('test context', { count: 42, flag: true });
    expect(mockChannel.lines.length).toBe(1);
    expect(mockChannel.lines[0]).toContain('"count":42');
    expect(mockChannel.lines[0]).toContain('"flag":true');
  });

  it('formats error objects with stack trace', () => {
    logger.setLevel('error');
    const err = new Error('Database connection failed');
    logger.error('failed op', err, { attempt: 3 });
    expect(mockChannel.lines.length).toBe(1);
    expect(mockChannel.lines[0]).toContain('Database connection failed');
    expect(mockChannel.lines[0]).toContain('"attempt":3');
  });
});
