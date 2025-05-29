'use client';

import { useState, useEffect, useCallback } from 'react';
import { File as AssistantFile } from '../types';

interface FileManagerProps {
  onFilesChange?: (files: AssistantFile[]) => void;
}

export default function FileManager({ onFilesChange }: FileManagerProps) {
  const [files, setFiles] = useState<AssistantFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedFile, setSelectedFile] = useState<AssistantFile | null>(null);

  // Fetch files from the assistant
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/files';
      if (filter) {
        url += `?filter=${encodeURIComponent(filter)}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'success') {
        setFiles(data.files);
        onFilesChange?.(data.files);
      } else {
        setError(data.message || 'Failed to fetch files');
      }
    } catch (error) {
      setError('Error fetching files');
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, onFilesChange]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Upload file
  const uploadFile = async (file: File, metadata?: Record<string, any>) => {
    setUploading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (metadata) {
        formData.append('metadata', JSON.stringify(metadata));
      }

      const response = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        await fetchFiles(); // Refresh file list
      } else {
        setError(data.message || 'Failed to upload file');
      }
    } catch (error) {
      setError('Error uploading file');
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  // Delete file
  const deleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        await fetchFiles(); // Refresh file list
        setSelectedFile(null);
      } else {
        setError(data.message || 'Failed to delete file');
      }
    } catch (error) {
      setError('Error deleting file');
      console.error('Error deleting file:', error);
    }
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(file => uploadFile(file));
  };

  // Handle file input
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    selectedFiles.forEach(file => uploadFile(file));
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return 'text-green-600 bg-green-100';
      case 'processing': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">File Manager</h2>
        <button
          onClick={fetchFiles}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
          dragOver 
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
            : 'border-gray-300 dark:border-gray-600'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="space-y-4">
          <div className="text-4xl">📁</div>
          <div>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              Drop files here or click to upload
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Supports PDF, TXT, MD, JSON, DOCX files
            </p>
          </div>
          <input
            type="file"
            multiple
            accept=".pdf,.txt,.md,.json,.docx"
            onChange={handleFileInput}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer"
          >
            {uploading ? 'Uploading...' : 'Choose Files'}
          </label>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Filter files (e.g., document_type:manual)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={() => setError('')}
            className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Files List */}
      <div className="space-y-2">
        {files.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            {loading ? 'Loading files...' : 'No files uploaded yet'}
          </p>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">📄</span>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{file.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                      <span>{formatFileSize(file.size)}</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(file.status)}`}>
                        {file.status}
                      </span>
                      <span>{new Date(file.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedFile(file)}
                  className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-500"
                >
                  Details
                </button>
                <button
                  onClick={() => deleteFile(file.id)}
                  className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* File Details Modal */}
      {selectedFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">File Details</h3>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                <p className="text-gray-900 dark:text-white">{selectedFile.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Size</label>
                <p className="text-gray-900 dark:text-white">{formatFileSize(selectedFile.size)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(selectedFile.status)}`}>
                  {selectedFile.status}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Created</label>
                <p className="text-gray-900 dark:text-white">{new Date(selectedFile.created_at).toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Updated</label>
                <p className="text-gray-900 dark:text-white">{new Date(selectedFile.updated_at).toLocaleString()}</p>
              </div>
              {selectedFile.metadata && Object.keys(selectedFile.metadata).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Metadata</label>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
                    {JSON.stringify(selectedFile.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 