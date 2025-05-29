'use client'

import { useState } from 'react';
import { File, Reference } from '../types';

interface AssistantFilesProps {
  files: File[];
  referencedFiles: Reference[];
}

export default function AssistantFiles({ files, referencedFiles }: AssistantFilesProps) {
  const [isOpen, setIsOpen] = useState(true);

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
    return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
  };

  const isReferenced = (file: File) => {
    return referencedFiles.some(ref => {
      return file.name.toLowerCase().includes(ref.name.toLowerCase()) ||
             ref.name.toLowerCase().includes(file.name.toLowerCase());
    });
  };

  const isPdfFile = (file: File) => {
    return file.name.toLowerCase().endsWith('.pdf');
  };

  const handleFileClick = (file: File) => {
    if (file.signed_url) {
      // Open all files in new tab (simple approach like original)
      window.open(file.signed_url, '_blank');
    }
  };

  return (
    <div className="w-full mt-4 bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
      <button
        className="w-full flex justify-between items-center p-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-gray-800 dark:text-gray-200">Assistant Files</span>
        <span className="text-xl text-gray-600 dark:text-gray-300">{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <div className="p-4">
          <div className="flex flex-wrap -mx-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="w-full sm:w-1/2 md:w-1/3 px-2 mb-4 relative"
              >
                <div 
                  className={`bg-gray-100 dark:bg-gray-700 p-4 rounded-lg transition-all duration-200 ${
                    isReferenced(file) ? 'border-2 border-blue-500 dark:border-blue-400' : ''
                  } ${
                    file.signed_url ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 hover:shadow-md' : ''
                  }`}
                  onClick={() => handleFileClick(file)}
                  title={file.signed_url ? `Click to open ${file.name}` : 'File not available'}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center mb-2">
                        {isPdfFile(file) ? (
                          <svg className="w-5 h-5 mr-2 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 mr-2 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path>
                          </svg>
                        )}
                        <h3 className="font-semibold truncate text-gray-800 dark:text-gray-200 text-sm">
                          {file.name}
                        </h3>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Size: {formatFileSize(file.size)}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Created: {new Date(file.created_at).toLocaleDateString()}
                      </p>
                      {file.signed_url && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                          Click to open
                        </p>
                      )}
                    </div>
                    {isReferenced(file) && (
                      <span className="bg-blue-500 dark:bg-blue-400 text-white text-xs px-2 py-1 rounded ml-2 flex-shrink-0">
                        Referenced
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {files.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No files available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
