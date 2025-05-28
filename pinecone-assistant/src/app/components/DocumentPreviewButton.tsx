'use client';

import React from 'react';

interface DocumentPreviewButtonProps {
  fileName: string;
  startPage: number;
  endPage?: number;
  searchText?: string;
  onClick: () => void;
  className?: string;
}

export default function DocumentPreviewButton({
  fileName,
  startPage,
  endPage,
  searchText,
  onClick,
  className = ''
}: DocumentPreviewButtonProps) {
  const pageText = endPage && endPage !== startPage 
    ? `pp. ${startPage}-${endPage}` 
    : `p. ${startPage}`;
  
  const displayText = `📄 ${fileName} (${pageText})`;
  
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors duration-200 shadow-sm ${className}`}
      title={`Preview ${fileName}${startPage ? ` (page ${startPage}${endPage && endPage !== startPage ? `-${endPage}` : ''})` : ''}`}
    >
      <svg
        className="w-4 h-4 mr-2 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
      </svg>
      <span className="truncate max-w-[250px]">{displayText}</span>
      {searchText && (
        <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1 py-0.5 rounded">
          Search: {searchText.substring(0, 20)}{searchText.length > 20 ? '...' : ''}
        </span>
      )}
    </button>
  );
} 