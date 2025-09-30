// src/utils/Logger.ts - Using existing AppConfig

import { AppConfig } from '../config/AppConfig';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LogContext = 'network' | 'socket' | 'performance' | 'general';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  context?: LogContext;
  timestamp: string;
  error?: Error;
}

class Logger {
  private levelPriority: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] <= this.levelPriority[AppConfig.debug.logLevel];
  }

  private formatLog(entry: LogEntry): string {
    const { level, message, timestamp } = entry;
    const prefix = AppConfig.isBrowser ? '🌐' : '🖥️';
    return `${prefix} [${level.toUpperCase()}] ${timestamp} - ${message}`;
  }

  private extractErrorInfo(error: any): any {
    if (!error) return null;

    // Axios error
    if (error.response) {
      return {
        message: error.message,
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url
      };
    }

    // Standard Error
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: AppConfig.isDevelopment ? error.stack : undefined
      };
    }

    return { message: String(error) };
  }

  // Main logging methods
  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      const entry: LogEntry = {
        level: 'debug',
        message,
        data,
        timestamp: new Date().toISOString()
      };
      console.log(this.formatLog(entry), data || '');
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      const entry: LogEntry = {
        level: 'info',
        message,
        data,
        timestamp: new Date().toISOString()
      };
      console.info(this.formatLog(entry), data || '');
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      const entry: LogEntry = {
        level: 'warn',
        message,
        data,
        timestamp: new Date().toISOString()
      };
      console.warn(this.formatLog(entry), data || '');
    }
  }

  error(message: string, error?: any, context?: any): void {
    if (this.shouldLog('error')) {
      const entry: LogEntry = {
        level: 'error',
        message,
        data: {
          error: this.extractErrorInfo(error),
          context
        },
        timestamp: new Date().toISOString()
      };
      console.error(this.formatLog(entry), entry.data);
    }
  }

  // Specialized loggers
  network(message: string, data?: any): void {
    if (AppConfig.debug.enableNetworkLogging) {
      console.log(`📡 [NETWORK] ${new Date().toISOString()} - ${message}`, data || '');
    }
  }

  socket(message: string, data?: any): void {
    if (AppConfig.debug.enableSocketLogging) {
      console.log(`🔌 [SOCKET] ${new Date().toISOString()} - ${message}`, data || '');
    }
  }

  performance(message: string, data?: any): void {
    if (AppConfig.debug.enablePerformanceLogging) {
      console.log(`⚡ [PERF] ${new Date().toISOString()} - ${message}`, data || '');
    }
  }
}

// Export singleton instance
export const logger = new Logger();