import { logger } from './logger';

interface ConnectionMetrics {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  averageConnectionTime: number;
  lastConnectionAttempt: number;
  consecutiveFailures: number;
}

class ConnectionHealthMonitor {
  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    successfulConnections: 0,
    failedConnections: 0,
    averageConnectionTime: 0,
    lastConnectionAttempt: 0,
    consecutiveFailures: 0
  };

  private connectionTimes: number[] = [];
  private maxConnectionTimeHistory = 10; // Keep last 10 connection times
  private maxConsecutiveFailures = 3; // Circuit breaker threshold

  // Record a connection attempt
  recordConnectionAttempt(): void {
    this.metrics.totalConnections++;
    this.metrics.lastConnectionAttempt = Date.now();
    logger.debug('Connection attempt recorded', { 
      total: this.metrics.totalConnections,
      consecutive_failures: this.metrics.consecutiveFailures 
    });
  }

  // Record a successful connection
  recordConnectionSuccess(connectionTime: number): void {
    this.metrics.successfulConnections++;
    this.metrics.consecutiveFailures = 0; // Reset failure counter
    
    // Track connection times for average calculation
    this.connectionTimes.push(connectionTime);
    if (this.connectionTimes.length > this.maxConnectionTimeHistory) {
      this.connectionTimes.shift(); // Remove oldest
    }
    
    // Calculate new average
    this.metrics.averageConnectionTime = 
      this.connectionTimes.reduce((a, b) => a + b, 0) / this.connectionTimes.length;

    logger.info('Connection successful', { 
      connection_time: connectionTime,
      average_time: Math.round(this.metrics.averageConnectionTime),
      success_rate: this.getSuccessRate()
    });
  }

  // Record a connection failure
  recordConnectionFailure(error?: string): void {
    this.metrics.failedConnections++;
    this.metrics.consecutiveFailures++;
    
    logger.warn('Connection failed', { 
      error,
      consecutive_failures: this.metrics.consecutiveFailures,
      success_rate: this.getSuccessRate()
    });

    // Log circuit breaker activation
    if (this.metrics.consecutiveFailures >= this.maxConsecutiveFailures) {
      logger.error('Circuit breaker activated - too many consecutive failures', {
        consecutive_failures: this.metrics.consecutiveFailures,
        threshold: this.maxConsecutiveFailures
      });
    }
  }

  // Check if we should allow new connections (circuit breaker)
  shouldAllowConnection(): boolean {
    const allow = this.metrics.consecutiveFailures < this.maxConsecutiveFailures;
    
    if (!allow) {
      logger.warn('Connection blocked by circuit breaker', {
        consecutive_failures: this.metrics.consecutiveFailures,
        threshold: this.maxConsecutiveFailures
      });
    }
    
    return allow;
  }

  // Get connection success rate
  getSuccessRate(): number {
    if (this.metrics.totalConnections === 0) return 100;
    return Math.round((this.metrics.successfulConnections / this.metrics.totalConnections) * 100);
  }

  // Check if connection health is good
  isHealthy(): boolean {
    const successRate = this.getSuccessRate();
    const recentFailures = this.metrics.consecutiveFailures;
    
    return successRate >= 70 && recentFailures < 2;
  }

  // Get health status for monitoring
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: ConnectionMetrics;
    recommendations: string[];
  } {
    const successRate = this.getSuccessRate();
    const recommendations: string[] = [];
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    
    if (successRate >= 90 && this.metrics.consecutiveFailures === 0) {
      status = 'healthy';
    } else if (successRate >= 70 && this.metrics.consecutiveFailures < 3) {
      status = 'degraded';
      recommendations.push('Monitor connection stability');
      if (this.metrics.averageConnectionTime > 5000) {
        recommendations.push('Connection times are high - check network');
      }
    } else {
      status = 'unhealthy';
      recommendations.push('Check network connectivity');
      recommendations.push('Verify API endpoints are accessible');
      if (this.metrics.consecutiveFailures >= this.maxConsecutiveFailures) {
        recommendations.push('Circuit breaker active - wait before retrying');
      }
    }

    return {
      status,
      metrics: { ...this.metrics },
      recommendations
    };
  }

  // Reset circuit breaker (for manual recovery)
  resetCircuitBreaker(): void {
    const previousFailures = this.metrics.consecutiveFailures;
    this.metrics.consecutiveFailures = 0;
    
    logger.info('Circuit breaker manually reset', {
      previous_failures: previousFailures
    });
  }

  // Get metrics for performance monitoring
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  // Reset all metrics (for testing or maintenance)
  resetMetrics(): void {
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionTime: 0,
      lastConnectionAttempt: 0,
      consecutiveFailures: 0
    };
    this.connectionTimes = [];
    
    logger.info('Connection metrics reset');
  }
}

// Singleton instance
export const connectionHealth = new ConnectionHealthMonitor();

// Utility function to wrap connection attempts with health monitoring
export async function withConnectionHealth<T>(
  connectionFn: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  if (!connectionHealth.shouldAllowConnection()) {
    throw new Error('Connection blocked by circuit breaker - too many recent failures');
  }

  connectionHealth.recordConnectionAttempt();
  const startTime = Date.now();

  try {
    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
    });

    // Race between connection and timeout
    const result = await Promise.race([
      connectionFn(),
      timeoutPromise
    ]);

    const connectionTime = Date.now() - startTime;
    connectionHealth.recordConnectionSuccess(connectionTime);
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    connectionHealth.recordConnectionFailure(errorMessage);
    throw error;
  }
}

export default connectionHealth; 