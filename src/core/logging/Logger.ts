import { LogLevel, LogLevelPriority } from './LogLevel';

export interface LogOutputChannel {
  appendLine(value: string): void;
  show?(preserveFocus?: boolean): void;
}

export interface IScopedLogger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
}

export class Logger {
  private static instance: Logger | null = null;
  private channel: LogOutputChannel | null = null;
  private currentLevel: LogLevel = 'info';

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setOutputChannel(channel: LogOutputChannel): void {
    this.channel = channel;
  }

  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  public getLevel(): LogLevel {
    return this.currentLevel;
  }

  public trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context);
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  public createChildLogger(
    moduleName: string,
    baseContext?: Record<string, unknown>
  ): IScopedLogger {
    return {
      trace: (msg: string, ctx?: Record<string, unknown>) =>
        this.trace(`[${moduleName}] ${msg}`, { ...baseContext, ...ctx }),
      debug: (msg: string, ctx?: Record<string, unknown>) =>
        this.debug(`[${moduleName}] ${msg}`, { ...baseContext, ...ctx }),
      info: (msg: string, ctx?: Record<string, unknown>) =>
        this.info(`[${moduleName}] ${msg}`, { ...baseContext, ...ctx }),
      warn: (msg: string, ctx?: Record<string, unknown>) =>
        this.warn(`[${moduleName}] ${msg}`, { ...baseContext, ...ctx }),
      error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) =>
        this.error(`[${moduleName}] ${msg}`, err, { ...baseContext, ...ctx }),
    };
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  public error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const errorDetails: Record<string, unknown> = { ...context };
    if (error instanceof Error) {
      errorDetails.errorMessage = error.message;
      errorDetails.stack = error.stack;
    } else if (error !== undefined) {
      errorDetails.errorRaw = String(error);
    }
    this.log('error', message, Object.keys(errorDetails).length > 0 ? errorDetails : undefined);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LogLevelPriority[level] < LogLevelPriority[this.currentLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedPrefix = `[${timestamp}] [${level.toUpperCase()}]`;
    let line = `${formattedPrefix} ${message}`;

    if (context && Object.keys(context).length > 0) {
      try {
        line += ` ${JSON.stringify(context)}`;
      } catch {
        line += ` [Unserializable Context]`;
      }
    }

    if (this.channel) {
      this.channel.appendLine(line);
    } else {
      // Fallback for tests or before channel is bound
      if (level === 'error') {
        console.error(line);
      } else if (level === 'warn') {
        console.warn(line);
      } else {
        console.log(line);
      }
    }
  }
}

export const logger = Logger.getInstance();
