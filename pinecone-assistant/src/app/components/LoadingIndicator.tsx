'use client';

import { useEffect, useState } from 'react';

interface LoadingIndicatorProps {
  isLoading: boolean;
  message?: string;
  showProgress?: boolean;
  duration?: number; // Expected duration in seconds for progress bar
}

export default function LoadingIndicator({ 
  isLoading, 
  message = "Processing...", 
  showProgress = false,
  duration = 15 
}: LoadingIndicatorProps) {
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      setDots('');
      return;
    }

    // Animated dots
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    // Progress bar simulation
    let progressInterval: NodeJS.Timeout;
    if (showProgress) {
      const increment = 100 / (duration * 10); // Update every 100ms
      progressInterval = setInterval(() => {
        setProgress(prev => {
          const next = prev + increment;
          return next >= 95 ? 95 : next; // Cap at 95% until actually done
        });
      }, 100);
    }

    return () => {
      clearInterval(dotsInterval);
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [isLoading, showProgress, duration]);

  if (!isLoading) return null;

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      {/* Spinner */}
      <div className="relative">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
        <div className="absolute inset-0 animate-ping rounded-full h-8 w-8 border border-indigo-300 dark:border-indigo-500 opacity-20"></div>
      </div>
      
      {/* Message with animated dots */}
      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 font-medium">
        {message}{dots}
      </p>
      
      {/* Progress bar */}
      {showProgress && (
        <div className="w-full max-w-xs mt-3">
          <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-indigo-600 dark:bg-indigo-400 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
            {Math.round(progress)}%
          </p>
        </div>
      )}
      
      {/* Helpful tip for long requests */}
      {showProgress && progress > 50 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center max-w-xs">
          Processing your maintenance query...
        </p>
      )}
    </div>
  );
} 