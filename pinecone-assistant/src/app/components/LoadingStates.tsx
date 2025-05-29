'use client';

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'white';
  className?: string;
}

export function LoadingSpinner({ size = 'md', color = 'primary', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  };

  const colorClasses = {
    primary: 'border-indigo-600',
    secondary: 'border-gray-600',
    white: 'border-white'
  };

  return (
    <div
      className={`animate-spin rounded-full border-2 border-t-transparent ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

interface LoadingSkeletonProps {
  className?: string;
  lines?: number;
  avatar?: boolean;
}

export function LoadingSkeleton({ className = '', lines = 3, avatar = false }: LoadingSkeletonProps) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="flex items-start space-x-3">
        {avatar && (
          <div className="h-8 w-8 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
        )}
        <div className="flex-1 space-y-2">
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className={`h-4 bg-gray-300 dark:bg-gray-600 rounded ${
                index === lines - 1 ? 'w-3/4' : 'w-full'
              }`}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface StreamingIndicatorProps {
  className?: string;
}

export function StreamingIndicator({ className = '' }: StreamingIndicatorProps) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400">AI is thinking...</span>
    </div>
  );
}

interface PDFLoadingProps {
  fileName?: string;
  progress?: number;
  className?: string;
}

export function PDFLoading({ fileName, progress, className = '' }: PDFLoadingProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
      <div className="relative">
        <LoadingSpinner size="lg" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 005.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
          </svg>
        </div>
      </div>
      
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Loading PDF Document
        </p>
        {fileName && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate max-w-xs">
            {fileName}
          </p>
        )}
        {progress !== undefined && (
          <div className="mt-2 w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            ></div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ConnectionLoadingProps {
  message?: string;
  className?: string;
}

export function ConnectionLoading({ message = 'Connecting to Assistant...', className = '' }: ConnectionLoadingProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
      <div className="relative">
        <div className="w-16 h-16 border-4 border-indigo-200 dark:border-indigo-800 rounded-full animate-pulse"></div>
        <div className="absolute inset-0 w-16 h-16 border-4 border-t-indigo-600 rounded-full animate-spin"></div>
        <div className="absolute inset-2 w-12 h-12 border-2 border-indigo-300 dark:border-indigo-700 rounded-full animate-ping"></div>
      </div>
      
      <div className="mt-6 text-center">
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {message}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          This may take a few moments...
        </p>
      </div>
    </div>
  );
}

interface FileLoadingProps {
  fileCount?: number;
  currentFile?: string;
  className?: string;
}

export function FileLoading({ fileCount, currentFile, className = '' }: FileLoadingProps) {
  return (
    <div className={`flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg ${className}`}>
      <LoadingSpinner size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Loading files...
        </p>
        {fileCount && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {fileCount} files found
          </p>
        )}
        {currentFile && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            Processing: {currentFile}
          </p>
        )}
      </div>
    </div>
  );
}

interface TypingIndicatorProps {
  className?: string;
  variant?: 'dots' | 'pulse' | 'wave';
}

export function TypingIndicator({ className = '', variant = 'dots' }: TypingIndicatorProps) {
  if (variant === 'pulse') {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
        <div className="flex-1">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1 w-3/4"></div>
        </div>
      </div>
    );
  }

  if (variant === 'wave') {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="w-1 h-4 bg-indigo-600 rounded-full animate-pulse"
            style={{ animationDelay: `${index * 0.1}s` }}
          ></div>
        ))}
      </div>
    );
  }

  // Default dots variant
  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
    </div>
  );
}

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  children?: React.ReactNode;
  className?: string;
}

export function LoadingOverlay({ isVisible, message, children, className = '' }: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm ${className}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center">
          <LoadingSpinner size="lg" />
          {message && (
            <p className="mt-4 text-center text-gray-900 dark:text-gray-100 font-medium">
              {message}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
} 