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

    const healthCheckDuration = Date.now() - startTime;
    
    const response = {
      status: serviceStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'unknown',
      checks: {
        connection_health: healthStatus,
        cache: {
          status: cacheStats.size > 0 ? 'active' : 'empty',
          size: cacheStats.size,
          hit_rate: cacheStats.hitRate
        },
        environment_variables: {
          status: missingEnvVars.length === 0 ? 'ok' : 'missing',
          missing: missingEnvVars
        },
        performance: {
          avg_response_time: avgResponseTime,
          health_check_duration: healthCheckDuration,
          total_requests: responseTimes.length
        }
      },
      issues: issues.length > 0 ? issues : undefined,
      recommendations: healthStatus.recommendations.length > 0 ? healthStatus.recommendations : undefined
    };

    logger.info('Health check completed', { 
      status: serviceStatus, 
      duration: healthCheckDuration,
      issues: issues.length 
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

// Optional: Add a simple HEAD endpoint for basic uptime checks
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
} 