export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LogLevelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
