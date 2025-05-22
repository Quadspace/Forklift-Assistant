'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import react-pdf components with no SSR
const PDFDocument = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Document })), { ssr: false });
const PDFPage = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Page })), { ssr: false });

// Set the workerSrc for PDF.js - do this in a useEffect to avoid SSR issues
import { pdfjs } from 'react-pdf';
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  fileName: string;
  startPage: number;
  endPage?: number;
  searchText?: string; // Optional text to highlight
}

export default function PDFPreviewModal({
  isOpen,
  onClose,
  pdfUrl,
  fileName,
  startPage,
  endPage,
  searchText,
}: PDFPreviewModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(startPage);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pageText, setPageText] = useState<string>('');
  const [highlightAreas, setHighlightAreas] = useState<any[]>([]);
  const pageCanvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset state when modal opens or PDF changes
    if (isOpen) {
      setCurrentPage(startPage);
      setError(null);
      setLoading(true);
      setHighlightAreas([]);
    }
  }, [isOpen, startPage, pdfUrl]);

  const onDocumentLoadSuccess = (loadInfo: any) => {
    setNumPages(loadInfo.numPages);
    setPdfDocument(loadInfo._pdfInfo.pdfDocument);
    setLoading(false);
  };

  function onDocumentLoadError(err: Error) {
    console.error('Error loading PDF:', err);
    setError('Failed to load PDF document. Please try again later.');
    setLoading(false);
  }

  function handlePreviousPage() {
    setCurrentPage((prevPage) => Math.max(1, prevPage - 1));
    setHighlightAreas([]);
  }

  function handleNextPage() {
    if (numPages) {
      setCurrentPage((prevPage) => Math.min(numPages, prevPage + 1));
      setHighlightAreas([]);
    }
  }

  // Extract text from the current page and find highlight positions
  useEffect(() => {
    const extractTextAndHighlight = async () => {
      if (!pdfDocument || !searchText || loading) return;

      try {
        // Get the page
        const page = await pdfDocument.getPage(currentPage);
        
        // Extract text content
        const textContent = await page.getTextContent();
        const pageTextContent = textContent.items.map((item: any) => item.str).join(' ');
        setPageText(pageTextContent);

        console.log(`Searching for text "${searchText}" in current page text:`, pageTextContent.substring(0, 200) + '...');
        
        // Find highlight positions
        if (searchText && pageTextContent.includes(searchText)) {
          console.log(`Found search text "${searchText}" in page ${currentPage}`);
          const viewport = page.getViewport({ scale: 1.0 });
          const highlights: any[] = [];

          // Simple approach - find all occurrences and create highlight boxes
          for (let i = 0; i < textContent.items.length; i++) {
            const item = textContent.items[i];
            if (item.str.includes(searchText)) {
              // Calculate position based on viewport
              const rect = {
                left: item.transform[4],
                top: item.transform[5],
                width: item.width,
                height: item.height
              };

              highlights.push({
                rect: rect,
                viewport: viewport
              });
              
              console.log(`Added highlight for "${item.str}" at position:`, rect);
            }
          }

          setHighlightAreas(highlights);
          console.log(`Created ${highlights.length} highlight areas`);
        } else {
          console.log(`Search text "${searchText}" not found in page ${currentPage}`);
        }
      } catch (error) {
        console.error('Error extracting text:', error);
      }
    };

    extractTextAndHighlight();
  }, [pdfDocument, currentPage, searchText, loading]);

  // Function to determine the page range text
  function getPageRangeText() {
    if (endPage && endPage > startPage) {
      return `Page ${currentPage} (Showing range: ${startPage}-${endPage})`;
    }
    return `Page ${currentPage} of ${numPages || '?'}`;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-11/12 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 truncate">
            {fileName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* PDF Content */}
        <div className="flex-1 overflow-auto p-4 flex flex-col items-center">
          {loading && (
            <div className="flex items-center justify-center h-full w-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-900"></div>
            </div>
          )}

          {error && (
            <div className="text-red-500 text-center p-4">
              {error}
            </div>
          )}

          {!error && (
            <div className="relative">
              {pdfUrl && (
                <div>
                  <PDFDocument
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={<div className="text-gray-500">Loading PDF...</div>}
                  >
                    <div ref={pageCanvasRef} className="relative">
                      <PDFPage
                        pageNumber={currentPage}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="pdf-page"
                        width={Math.min(window.innerWidth * 0.8, 900)}
                      />
                      
                      {/* Highlight overlay */}
                      {highlightAreas.length > 0 && (
                        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                          {highlightAreas.map((highlight, index) => {
                            const { rect } = highlight;
                            return (
                              <div
                                key={`highlight-${index}`}
                                className="absolute bg-yellow-300 bg-opacity-50 dark:bg-yellow-600 dark:bg-opacity-50"
                                style={{
                                  left: `${rect.left}px`,
                                  top: `${rect.top}px`,
                                  width: `${rect.width}px`,
                                  height: `${rect.height}px`,
                                  transform: 'scale(1.5)', // Adjust based on page scale
                                  transformOrigin: '0 0'
                                }}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </PDFDocument>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div className="text-gray-700 dark:text-gray-300">
            {getPageRangeText()}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage <= 1}
              className={`px-3 py-1 rounded ${
                currentPage <= 1
                  ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-500 text-white hover:bg-indigo-600'
              }`}
            >
              Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={numPages !== null && currentPage >= numPages}
              className={`px-3 py-1 rounded ${
                numPages !== null && currentPage >= numPages
                  ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-500 text-white hover:bg-indigo-600'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 