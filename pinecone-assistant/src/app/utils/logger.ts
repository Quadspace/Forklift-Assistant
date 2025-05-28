type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableMetrics: boolean;
}

class Logger {
  private config: LoggerConfig;
  private metrics: Map<string, number> = new Map();

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    this.config = {
      level: isProduction ? 'error' : 'debug',
      enableConsole: !isProduction,
      enableMetrics: true
    };
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    return levels[level] <= levels[this.config.level];
  }

  error(message: string, data?: any): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, data || '');
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn') && this.config.enableConsole) {
      console.warn(`[WARN] ${message}`, data || '');
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info') && this.config.enableConsole) {
      console.info(`[INFO] ${message}`, data || '');
    }
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug') && this.config.enableConsole) {
      console.log(`[DEBUG] ${message}`, data || '');
    }
  }

  // Metrics logging for performance monitoring
  metric(name: string, value: number, unit: string = 'ms'): void {
    if (this.config.enableMetrics) {
      this.metrics.set(name, value);
      if (this.shouldLog('info')) {
        console.info(`[METRIC] ${name}: ${value}${unit}`);
      }
    }
  }

  // Performance timing helper
  time(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.metric(label, duration);
    };
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  clearMetrics(): void {
    this.metrics.clear();
  }
}

export const logger = new Logger();
export default logger; 