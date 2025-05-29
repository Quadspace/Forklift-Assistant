/**
 * Enhanced logging utility for production and development environments
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: string;
  component?: string;
}

class Logger {
  private isDevelopment: boolean;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 100;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private createLogEntry(level: LogLevel, message: string, data?: any, component?: string): LogEntry {
    return {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      component
    };
  }

  private addToHistory(entry: LogEntry): void {
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.isDevelopment && level === 'debug') {
      return false;
    }
    return true;
  }

  debug(message: string, data?: any, component?: string): void {
    const entry = this.createLogEntry('debug', message, data, component);
    this.addToHistory(entry);
    
    if (this.shouldLog('debug')) {
      if (component) {
        console.log(`[DEBUG:${component}] ${message}`, data || '');
      } else {
        console.log(`[DEBUG] ${message}`, data || '');
      }
    }
  }

  info(message: string, data?: any, component?: string): void {
    const entry = this.createLogEntry('info', message, data, component);
    this.addToHistory(entry);
    
    if (this.shouldLog('info')) {
      if (component) {
        console.info(`[INFO:${component}] ${message}`, data || '');
      } else {
        console.info(`[INFO] ${message}`, data || '');
      }
    }
  }

  warn(message: string, data?: any, component?: string): void {
    const entry = this.createLogEntry('warn', message, data, component);
    this.addToHistory(entry);
    
    if (this.shouldLog('warn')) {
      if (component) {
        console.warn(`[WARN:${component}] ${message}`, data || '');
      } else {
        console.warn(`[WARN] ${message}`, data || '');
      }
    }
  }

  error(message: string, data?: any, component?: string): void {
    const entry = this.createLogEntry('error', message, data, component);
    this.addToHistory(entry);
    
    if (this.shouldLog('error')) {
      if (component) {
        console.error(`[ERROR:${component}] ${message}`, data || '');
      } else {
        console.error(`[ERROR] ${message}`, data || '');
      }
    }
  }

  // Get recent log history for debugging
  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  // Clear log history
  clearHistory(): void {
    this.logHistory = [];
  }
}

export const logger = new Logger();
export default logger; 