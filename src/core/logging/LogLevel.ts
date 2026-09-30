export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export const LogLevelPriority: Record<LogLevel, number> = {
  trace: -1,
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
