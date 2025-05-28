'use client';

import { useEffect, useState } from 'react';
import { logger } from '../utils/logger';

interface PerformanceMetrics {
  responseTime: number;
  cacheHitRate: number;
  activeRequests: number;
  totalRequests: number;
}

interface PerformanceMonitorProps {
  show?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export default function PerformanceMonitor({ 
  show = false, 
  position = 'bottom-right' 
}: PerformanceMonitorProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    responseTime: 0,
    cacheHitRate: 0,
    activeRequests: 0,
    totalRequests: 0
  });
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (!isVisible) return;

    const updateMetrics = () => {
      const loggerMetrics = logger.getMetrics();
      
      // Calculate average response time
      const responseTimes = Object.entries(loggerMetrics)
        .filter(([key]) => key.includes('api_request') || key.includes('chat'))
        .map(([, value]) => value);
      
      const avgResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0;

      setMetrics(prev => ({
        ...prev,
        responseTime: Math.round(avgResponseTime),
        totalRequests: responseTimes.length
      }));
    };

    // Update metrics every 2 seconds
    const interval = setInterval(updateMetrics, 2000);
    updateMetrics(); // Initial update

    return () => clearInterval(interval);
  }, [isVisible]);

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  };

  if (!isVisible && !show) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className={`fixed ${positionClasses[position]} z-50 p-2 bg-gray-800 text-white rounded-full shadow-lg hover:bg-gray-700 transition-colors`}
        title="Toggle Performance Monitor"
      >
        📊
      </button>

      {/* Metrics panel */}
      {isVisible && (
        <div className={`fixed ${positionClasses[position]} z-40 mt-12 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 min-w-[200px]`}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
            Performance Metrics
          </h3>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Response:</span>
              <span className={`font-mono ${metrics.responseTime > 5000 ? 'text-red-500' : metrics.responseTime > 2000 ? 'text-yellow-500' : 'text-green-500'}`}>
                {metrics.responseTime}ms
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Cache Hit Rate:</span>
              <span className={`font-mono ${metrics.cacheHitRate > 70 ? 'text-green-500' : metrics.cacheHitRate > 30 ? 'text-yellow-500' : 'text-red-500'}`}>
                {metrics.cacheHitRate}%
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Requests:</span>
              <span className="font-mono text-gray-800 dark:text-gray-200">
                {metrics.totalRequests}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Active:</span>
              <span className="font-mono text-gray-800 dark:text-gray-200">
                {metrics.activeRequests}
              </span>
            </div>
          </div>

          {/* Performance status indicator */}
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                metrics.responseTime < 2000 ? 'bg-green-500' : 
                metrics.responseTime < 5000 ? 'bg-yellow-500' : 'bg-red-500'
              }`}></div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {metrics.responseTime < 2000 ? 'Excellent' : 
                 metrics.responseTime < 5000 ? 'Good' : 'Needs Optimization'}
              </span>
            </div>
          </div>

          {/* Clear metrics button */}
          <button
            onClick={() => {
              logger.clearMetrics();
              setMetrics({
                responseTime: 0,
                cacheHitRate: 0,
                activeRequests: 0,
                totalRequests: 0
              });
            }}
            className="mt-2 w-full text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 py-1 px-2 rounded transition-colors"
          >
            Clear Metrics
          </button>
        </div>
      )}
    </>
  );
} 