import { NextResponse } from 'next/server';
import { logger } from '../../utils/logger';
import { connectionHealth } from '../../utils/connectionHealth';
import { cache } from '../../utils/cache';

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Get connection health status
    const healthStatus = connectionHealth.getHealthStatus();
    
    // Get cache statistics
    const cacheStats = cache.getStats();
    
    // Get logger metrics
    const loggerMetrics = logger.getMetrics();
    
    // Calculate average response time from metrics
    const responseTimes = Object.entries(loggerMetrics)
      .filter(([key]) => key.includes('api_request') || key.includes('chat'))
      .map(([, value]) => value);
    
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    // Determine overall service health
    let serviceStatus: 'healthy' | 'degraded' | 'unhealthy';
    const issues: string[] = [];
    
    if (healthStatus.status === 'healthy' && avgResponseTime < 5000) {
      serviceStatus = 'healthy';
    } else if (healthStatus.status === 'degraded' || avgResponseTime > 10000) {
      serviceStatus = 'degraded';
      if (avgResponseTime > 10000) {
        issues.push('High response times detected');
      }
      if (healthStatus.status === 'degraded') {
        issues.push('Connection stability issues');
      }
    } else {
      serviceStatus = 'unhealthy';
      issues.push('Service experiencing significant issues');
    }

    // Check environment variables
    const envCheck = {
      pinecone_api_key: !!process.env.PINECONE_API_KEY,
      pinecone_assistant_name: !!process.env.PINECONE_ASSISTANT_NAME,
      pinecone_assistant_url: !!process.env.PINECONE_ASSISTANT_URL,
      pinecone_assistant_id: !!process.env.PINECONE_ASSISTANT_ID,
    };

    const missingEnvVars = Object.entries(envCheck)
      .filter(([, exists]) => !exists)
      .map(([key]) => key);

    if (missingEnvVars.length > 0) {
      serviceStatus = 'unhealthy';
      issues.push(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    }

    // Add detailed connection diagnostics
    const connectionDiagnostics = {
      circuit_breaker_active: !connectionHealth.shouldAllowConnection(),
      consecutive_failures: healthStatus.metrics.consecutiveFailures,
      success_rate: Math.round((healthStatus.metrics.successfulConnections / Math.max(1, healthStatus.metrics.totalConnections)) * 100),
      last_attempt: healthStatus.metrics.lastConnectionAttempt ? new Date(healthStatus.metrics.lastConnectionAttempt).toISOString() : null,
      pinecone_endpoint: process.env.PINECONE_ASSISTANT_URL ? 
        `${process.env.PINECONE_ASSISTANT_URL}/assistant/chat/${process.env.PINECONE_ASSISTANT_NAME}/chat/completions` : 
        'Not configured'
    };

    const healthCheckDuration = Date.now() - startTime;
    
    const response = {
      status: serviceStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'unknown',
      checks: {
        connection_health: healthStatus,
        connection_diagnostics: connectionDiagnostics,
        cache: {
          status: cacheStats.size > 0 ? 'active' : 'empty',
          size: cacheStats.size,
          hit_rate: cacheStats.hitRate
        },
        environment_variables: {
          status: missingEnvVars.length === 0 ? 'ok' : 'missing',
          missing: missingEnvVars,
          configured: Object.keys(envCheck).filter(key => envCheck[key as keyof typeof envCheck])
        },
        performance: {
          avg_response_time: avgResponseTime,
          health_check_duration: healthCheckDuration,
          total_requests: responseTimes.length
        }
      },
      issues: issues.length > 0 ? issues : undefined,
      recommendations: [
        ...healthStatus.recommendations,
        ...(connectionDiagnostics.circuit_breaker_active ? ['Circuit breaker is active - use POST /api/health to reset'] : []),
        ...(connectionDiagnostics.success_rate < 50 ? ['Check Pinecone API connectivity and credentials'] : []),
        ...(missingEnvVars.length > 0 ? ['Configure missing environment variables'] : [])
      ].filter(Boolean)
    };

    logger.info('Health check completed', { 
      status: serviceStatus, 
      duration: healthCheckDuration,
      issues: issues.length,
      circuit_breaker_active: connectionDiagnostics.circuit_breaker_active
    });

    // Return appropriate HTTP status based on health
    const httpStatus = serviceStatus === 'healthy' ? 200 : 
                      serviceStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(response, { status: httpStatus });

  } catch (error) {
    logger.error('Health check failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 503 });
  }
}

// POST endpoint to reset circuit breaker and clear cache
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    const results: any = {
      timestamp: new Date().toISOString(),
      actions_performed: []
    };

    // Reset circuit breaker
    if (action === 'reset_circuit_breaker' || action === 'reset_all') {
      connectionHealth.resetCircuitBreaker();
      results.actions_performed.push('circuit_breaker_reset');
      logger.info('Circuit breaker manually reset via API');
    }

    // Clear cache
    if (action === 'clear_cache' || action === 'reset_all') {
      cache.clear();
      results.actions_performed.push('cache_cleared');
      logger.info('Cache manually cleared via API');
    }

    // Reset connection metrics
    if (action === 'reset_metrics' || action === 'reset_all') {
      connectionHealth.resetMetrics();
      results.actions_performed.push('metrics_reset');
      logger.info('Connection metrics manually reset via API');
    }

    if (results.actions_performed.length === 0) {
      return NextResponse.json({
        error: 'No valid action specified',
        available_actions: ['reset_circuit_breaker', 'clear_cache', 'reset_metrics', 'reset_all']
      }, { status: 400 });
    }

    results.message = `Successfully performed: ${results.actions_performed.join(', ')}`;
    
    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    logger.error('Health action failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });

    return NextResponse.json({
      error: 'Action failed',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Optional: Add a simple HEAD endpoint for basic uptime checks
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
} 