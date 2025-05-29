'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { processPdfUrl, ensurePdfUrlWorks } from '../utils/pdfUtils';
import { logger } from '../utils/logger';
import { 
  parsePageNumbers, 
  extractPageFromReference, 
  formatPageRange, 
  getOptimalStartPage, 
  smoothScrollToPage,
  parseReferenceContext,
  PageRange 
} from '../utils/pageNavigationUtils';

// Dynamically import react-pdf components with no SSR
const PDFDocument = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Document })), { ssr: false });
const PDFPage = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Page })), { ssr: false });

// Set the workerSrc for PDF.js with better error handling
import { pdfjs } from 'react-pdf';

// Configure PDF.js worker with fallback options
if (typeof window !== 'undefined') {
  // Try multiple CDN sources for better reliability
  const workerSources = [
    `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`,
    `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`,
    `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`
  ];
  
  // Use the first available worker source
  pdfjs.GlobalWorkerOptions.workerSrc = workerSources[0];
  
  // Add error handling for worker loading
  const originalWorkerSrc = pdfjs.GlobalWorkerOptions.workerSrc;
  
  // Test worker availability and fallback if needed
  const testWorker = () => {
    try {
      const worker = new Worker(pdfjs.GlobalWorkerOptions.workerSrc);
      worker.terminate();
      console.log('PDF.js worker loaded successfully from:', pdfjs.GlobalWorkerOptions.workerSrc);
    } catch (error) {
      console.warn('PDF.js worker failed to load from:', pdfjs.GlobalWorkerOptions.workerSrc);
      // Try next source
      const currentIndex = workerSources.indexOf(pdfjs.GlobalWorkerOptions.workerSrc);
      if (currentIndex < workerSources.length - 1) {
        pdfjs.GlobalWorkerOptions.workerSrc = workerSources[currentIndex + 1];
        console.log('Trying alternative PDF.js worker source:', pdfjs.GlobalWorkerOptions.workerSrc);
      }
    }
  };
  
  // Test worker on component load
  setTimeout(testWorker, 100);
}

interface DocumentChunk {
  id: string;
  score: number;
  text: string;
  page: number | null;
  fileName: string;
  metadata: any;
}

interface EnhancedPDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  fileName: string;
  startPage: number;
  endPage?: number;
  searchText?: string;
}

export default function EnhancedPDFPreviewModal({
  isOpen,
  onClose,
  pdfUrl,
  fileName,
  startPage,
  endPage,
  searchText,
}: EnhancedPDFPreviewModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(startPage || 1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pageText, setPageText] = useState<string>('');
  const [highlightAreas, setHighlightAreas] = useState<any[]>([]);
  const [documentChunks, setDocumentChunks] = useState<DocumentChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState<boolean>(false);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const [showFullDocument, setShowFullDocument] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'chunks' | 'debug'>('preview');
  const [processedPdfUrl, setProcessedPdfUrl] = useState<string>('');
  const [parsedPageRange, setParsedPageRange] = useState<PageRange | null>(null);
  const [autoNavigated, setAutoNavigated] = useState<boolean>(false);
  const pageCanvasRef = useRef<HTMLDivElement>(null);

  // Log props when the component receives them
  useEffect(() => {
    logger.info('EnhancedPDFPreviewModal props received:', {
      isOpen,
      pdfUrl,
      fileName,
      startPage,
      endPage,
      searchText
    });

    // Parse page information from search text if available
    if (searchText) {
      const context = parseReferenceContext(searchText);
      setParsedPageRange(context.pageRange);
      
      if (context.pageRange) {
        logger.info('Parsed page range from search text:', {
          searchText,
          pageRange: context.pageRange,
          searchTerms: context.searchTerms
        });
      }
    }
  }, [isOpen, pdfUrl, fileName, startPage, endPage, searchText]);

  // Process PDF URL when it changes
  useEffect(() => {
    const processPdfUrlAsync = async () => {
      if (!pdfUrl) {
        setProcessedPdfUrl('');
        return;
      }

      logger.info('Processing PDF URL:', pdfUrl);
      
      try {
        // First try to process the URL
        const processed = processPdfUrl(pdfUrl);
        logger.info('Initial processed URL:', processed);
        
        // Then ensure it works (handle CORS if needed)
        const workingUrl = await ensurePdfUrlWorks(processed);
        logger.info('Final working URL:', workingUrl ? 'URL ready' : 'No URL');
        
        setProcessedPdfUrl(workingUrl);
      } catch (error) {
        logger.error('Error processing PDF URL:', error);
        setProcessedPdfUrl(pdfUrl); // Fallback to original URL
      }
    };

    if (isOpen && pdfUrl) {
      processPdfUrlAsync();
    }
  }, [isOpen, pdfUrl]);

  useEffect(() => {
    // Reset state when modal opens or PDF changes
    if (isOpen) {
      // Determine the optimal start page
      let optimalStartPage = startPage || 1;
      
      // If we have parsed page range from search text, use that
      if (parsedPageRange && parsedPageRange.confidence > 0.7) {
        optimalStartPage = parsedPageRange.startPage;
        logger.info('Using parsed page range for navigation:', {
          originalStartPage: startPage,
          parsedStartPage: optimalStartPage,
          confidence: parsedPageRange.confidence
        });
      }

      logger.info(`Modal opened, setting current page to ${optimalStartPage}`);
      setCurrentPage(optimalStartPage);
      setError(null);
      setLoading(true);
      setHighlightAreas([]);
      setDocumentChunks([]);
      setChunksError(null);
      setShowFullDocument(false);
      setActiveTab('preview');
      setAutoNavigated(false);
      
      if (!pdfUrl) {
        setError('No PDF URL provided');
        setLoading(false);
      } else {
        // Fetch document chunks when modal opens
        fetchDocumentChunks();
      }
    }
  }, [isOpen, startPage, pdfUrl, fileName, parsedPageRange]);

  // Auto-navigate to the correct page once PDF is loaded
  useEffect(() => {
    if (numPages && !autoNavigated && parsedPageRange) {
      const optimalPage = getOptimalStartPage(parsedPageRange, numPages);
      
      if (optimalPage !== currentPage && optimalPage <= numPages) {
        logger.info('Auto-navigating to optimal page after PDF load:', {
          currentPage,
          optimalPage,
          totalPages: numPages,
          confidence: parsedPageRange.confidence
        });
        
        smoothScrollToPage(optimalPage, setCurrentPage, 500);
        setAutoNavigated(true);
      }
    }
  }, [numPages, autoNavigated, parsedPageRange, currentPage]);

  const fetchDocumentChunks = async () => {
    if (!fileName) return;
    
    setChunksLoading(true);
    setChunksError(null);
    
    try {
      // Use parsed page range if available and more specific
      const effectiveStartPage = parsedPageRange?.startPage || startPage;
      const effectiveEndPage = parsedPageRange?.endPage || endPage;
      
      const response = await fetch('/api/document-chunks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: fileName,
          startPage: effectiveStartPage,
          endPage: effectiveEndPage,
          searchQuery: searchText
        }),
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        setDocumentChunks(data.chunks);
        logger.info(`Loaded ${data.chunks.length} document chunks for pages ${effectiveStartPage}-${effectiveEndPage || effectiveStartPage}`);
      } else {
        setChunksError(data.message || 'Failed to load document chunks');
      }
    } catch (error) {
      logger.error('Error fetching document chunks:', error);
      setChunksError('Failed to fetch document chunks');
    } finally {
      setChunksLoading(false);
    }
  };

  const onDocumentLoadSuccess = (loadInfo: any) => {
    logger.info('PDF document loaded successfully:', loadInfo);
    setNumPages(loadInfo.numPages);
    setPdfDocument(loadInfo._pdfInfo.pdfDocument);
    setLoading(false);
    
    // Validate current page against total pages
    if (currentPage > loadInfo.numPages) {
      logger.warn('Current page exceeds total pages, adjusting:', {
        currentPage,
        totalPages: loadInfo.numPages
      });
      setCurrentPage(Math.min(currentPage, loadInfo.numPages));
    }
  };

  function onDocumentLoadError(err: Error) {
    logger.error('PDF document load error:', err);
    setError(`Failed to load PDF document: ${err.message}`);
    setLoading(false);
    
    // Provide specific error guidance
    if (err.message.includes('CORS')) {
      setError('PDF loading blocked by CORS policy. Trying alternative loading method...');
      // Try to reload with proxy
      setTimeout(() => {
        const proxyUrl = `/api/pdf-proxy?url=${encodeURIComponent(pdfUrl)}`;
        setProcessedPdfUrl(proxyUrl);
        setError(null);
        setLoading(true);
      }, 2000);
    } else if (err.message.includes('404') || err.message.includes('Not Found')) {
      setError('PDF file not found. The document may have been moved or deleted.');
    } else if (err.message.includes('403') || err.message.includes('Forbidden')) {
      setError('Access denied to PDF file. The signed URL may have expired.');
    }
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

  function handleExpandToFullDocument() {
    setShowFullDocument(true);
    setCurrentPage(1);
  }

  function handleReturnToPageRange() {
    setShowFullDocument(false);
    const returnPage = parsedPageRange?.startPage || startPage || 1;
    setCurrentPage(returnPage);
    logger.info('Returning to page range:', { returnPage, parsedPageRange });
  }

  // Jump to a specific page (used by chunk navigation)
  function jumpToPage(pageNumber: number) {
    if (pageNumber >= 1 && (!numPages || pageNumber <= numPages)) {
      logger.info('Jumping to specific page:', { pageNumber });
      setCurrentPage(pageNumber);
      setActiveTab('preview');
      
      // Smooth scroll to top of PDF viewer
      if (pageCanvasRef.current) {
        pageCanvasRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
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

        logger.info(`Searching for text "${searchText}" in current page text:`, pageTextContent.substring(0, 200) + '...');
        
        // Find highlight positions
        if (searchText && pageTextContent.includes(searchText)) {
          logger.info(`Found search text "${searchText}" in page ${currentPage}`);
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
              
              logger.info(`Added highlight for "${item.str}" at position:`, rect);
            }
          }

          setHighlightAreas(highlights);
          logger.info(`Created ${highlights.length} highlight areas`);
        } else {
          logger.info(`Search text "${searchText}" not found in page ${currentPage}`);
        }
      } catch (error) {
        logger.error('Error extracting text:', error);
      }
    };

    extractTextAndHighlight();
  }, [pdfDocument, currentPage, searchText, loading]);

  // Function to determine the page range text
  function getPageRangeText() {
    if (showFullDocument) {
      return `Page ${currentPage} of ${numPages || '?'} (Full Document)`;
    }
    
    // Show parsed page range if available
    if (parsedPageRange) {
      const rangeText = formatPageRange(parsedPageRange);
      if (parsedPageRange.endPage && parsedPageRange.endPage > parsedPageRange.startPage) {
        return `Page ${currentPage} (Referenced: ${rangeText})`;
      }
      return `Page ${currentPage} (Referenced: ${rangeText})`;
    }
    
    if (endPage && endPage > startPage) {
      return `Page ${currentPage} (Showing range: ${startPage}-${endPage})`;
    }
    return `Page ${currentPage} of ${numPages || '?'}`;
  }

  // Function to check if current page is within the original range
  function isWithinOriginalRange() {
    if (showFullDocument) return true;
    
    // Check against parsed page range if available
    if (parsedPageRange) {
      if (parsedPageRange.endPage) {
        return currentPage >= parsedPageRange.startPage && currentPage <= parsedPageRange.endPage;
      }
      return currentPage === parsedPageRange.startPage;
    }
    
    // Fall back to original range
    if (!endPage) return currentPage === startPage;
    return currentPage >= startPage && currentPage <= endPage;
  }

  // Handle direct page input
  function handlePageInput(pageNumber: string) {
    const page = parseInt(pageNumber, 10);
    if (!isNaN(page) && page >= 1 && (!numPages || page <= numPages)) {
      jumpToPage(page);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-11/12 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 truncate">
              {fileName}
            </h2>
            
            {/* Page range indicator in header */}
            {parsedPageRange && (
              <div className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                Referenced: {formatPageRange(parsedPageRange)}
                {parsedPageRange.confidence < 0.8 && (
                  <span className="ml-1 text-xs opacity-75">(low confidence)</span>
                )}
              </div>
            )}
            
            {!showFullDocument && endPage && endPage > startPage && (
              <button
                onClick={handleExpandToFullDocument}
                className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors"
              >
                View Full Document
              </button>
            )}
            {showFullDocument && (
              <button
                onClick={handleReturnToPageRange}
                className="text-sm bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 transition-colors"
              >
                Return to Pages {parsedPageRange?.startPage || startPage}-{parsedPageRange?.endPage || endPage || parsedPageRange?.startPage || startPage}
              </button>
            )}
          </div>
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

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'preview'
                ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            PDF Preview
          </button>
          <button
            onClick={() => setActiveTab('chunks')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'chunks'
                ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Relevant Content ({documentChunks.length})
          </button>
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => setActiveTab('debug' as any)}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'debug'
                  ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Debug
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'preview' ? (
            /* PDF Preview Tab */
            <div className="h-full overflow-auto p-4 flex flex-col items-center">
              {loading && (
                <div className="flex items-center justify-center h-full w-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-900"></div>
                </div>
              )}

              {error && (
                <div className="text-red-500 text-center p-4">
                  {error}
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        setError(null);
                        setLoading(true);
                        setProcessedPdfUrl(pdfUrl); // Retry with original URL
                      }}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {!error && (
                <div className="relative">
                  {processedPdfUrl && (
                    <div>
                      {/* @ts-ignore - Ignoring type issues with dynamic imports */}
                      <PDFDocument
                        file={processedPdfUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={onDocumentLoadError}
                        loading={<div className="text-gray-500">Loading PDF...</div>}
                      >
                        <div ref={pageCanvasRef} className="relative">
                          {/* @ts-ignore - Ignoring type issues with dynamic imports */}
                          <PDFPage
                            pageNumber={currentPage}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="pdf-page"
                            width={Math.min(window.innerWidth * 0.6, 800)}
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

                          {/* Page range indicator */}
                          {!isWithinOriginalRange() && (
                            <div className="absolute top-2 left-2 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded text-sm">
                              Outside referenced range
                            </div>
                          )}
                          
                          {/* Auto-navigation indicator */}
                          {autoNavigated && parsedPageRange && (
                            <div className="absolute top-2 right-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded text-sm animate-pulse">
                              Auto-navigated to {formatPageRange(parsedPageRange)}
                            </div>
                          )}
                        </div>
                      </PDFDocument>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'chunks' ? (
            /* Document Chunks Tab */
            <div className="h-full overflow-auto p-4">
              {chunksLoading && (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-900"></div>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">Loading relevant content...</span>
                </div>
              )}

              {chunksError && (
                <div className="text-red-500 text-center p-4">
                  {chunksError}
                </div>
              )}

              {!chunksLoading && !chunksError && documentChunks.length === 0 && (
                <div className="text-gray-500 text-center p-4">
                  No relevant content found for the specified pages.
                </div>
              )}

              {!chunksLoading && !chunksError && documentChunks.length > 0 && (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Found {documentChunks.length} relevant content sections
                    {parsedPageRange ? ` for ${formatPageRange(parsedPageRange)}` : ` for pages ${startPage}-${endPage || startPage}`}
                    {searchText && ` matching "${searchText}"`}
                  </div>
                  
                  {documentChunks.map((chunk, index) => (
                    <div
                      key={chunk.id}
                      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {chunk.page ? `Page ${chunk.page}` : 'Page unknown'} • 
                          Relevance: {(chunk.score * 100).toFixed(1)}%
                        </div>
                        {chunk.page && (
                          <button
                            onClick={() => jumpToPage(chunk.page!)}
                            className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition-colors"
                          >
                            View Page
                          </button>
                        )}
                      </div>
                      <div className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                        {chunk.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Debug Tab */
            <div className="h-full overflow-auto p-4">
              <div className="space-y-4 text-sm">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">PDF Loading Debug Info</h3>
                
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Page Navigation</h4>
                  <div className="space-y-1 text-xs">
                    <div><span className="font-medium">Parsed Page Range:</span> {parsedPageRange ? formatPageRange(parsedPageRange) : 'None'}</div>
                    <div><span className="font-medium">Confidence:</span> {parsedPageRange?.confidence ? (parsedPageRange.confidence * 100).toFixed(1) + '%' : 'N/A'}</div>
                    <div><span className="font-medium">Auto-navigated:</span> {autoNavigated ? 'Yes' : 'No'}</div>
                    <div><span className="font-medium">Search Text:</span> {searchText || 'None'}</div>
                  </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">URLs</h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-medium">Original URL:</span>
                      <div className="break-all text-gray-600 dark:text-gray-400 mt-1">
                        {pdfUrl || 'Not provided'}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">Processed URL:</span>
                      <div className="break-all text-gray-600 dark:text-gray-400 mt-1">
                        {processedPdfUrl || 'Not processed yet'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Modal State</h4>
                  <div className="space-y-1 text-xs">
                    <div><span className="font-medium">Loading:</span> {loading ? 'Yes' : 'No'}</div>
                    <div><span className="font-medium">Error:</span> {error || 'None'}</div>
                    <div><span className="font-medium">Current Page:</span> {currentPage}</div>
                    <div><span className="font-medium">Total Pages:</span> {numPages || 'Unknown'}</div>
                    <div><span className="font-medium">File Name:</span> {fileName}</div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Actions</h4>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        logger.info('🔄 Retrying with original URL...');
                        setError(null);
                        setLoading(true);
                        setProcessedPdfUrl(pdfUrl);
                      }}
                      className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600"
                    >
                      Retry with Original URL
                    </button>
                    <button
                      onClick={() => {
                        logger.info('🔄 Retrying with proxy...');
                        setError(null);
                        setLoading(true);
                        setProcessedPdfUrl(`/api/pdf-proxy?url=${encodeURIComponent(pdfUrl)}`);
                      }}
                      className="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600 ml-2"
                    >
                      Try Proxy
                    </button>
                    <button
                      onClick={() => {
                        logger.info('📋 PDF Debug Info:', {
                          pdfUrl,
                          processedPdfUrl,
                          fileName,
                          loading,
                          error,
                          currentPage,
                          numPages,
                          parsedPageRange,
                          autoNavigated
                        });
                      }}
                      className="bg-gray-500 text-white px-3 py-1 rounded text-xs hover:bg-gray-600 ml-2"
                    >
                      Log Debug Info
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Footer with navigation - only show for PDF preview tab */}
        {activeTab === 'preview' && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <div className="text-gray-700 dark:text-gray-300">
                  {getPageRangeText()}
                </div>
                
                {/* Quick page jump input */}
                {numPages && numPages > 5 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Go to:</span>
                    <input
                      type="number"
                      min="1"
                      max={numPages}
                      value={currentPage}
                      onChange={(e) => handlePageInput(e.target.value)}
                      className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">of {numPages}</span>
                  </div>
                )}
              </div>
              
              <div className="flex space-x-2">
                {/* Jump to referenced page button */}
                {parsedPageRange && currentPage !== parsedPageRange.startPage && (
                  <button
                    onClick={() => jumpToPage(parsedPageRange.startPage)}
                    className="text-sm bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition-colors"
                  >
                    Go to Referenced Page
                  </button>
                )}
                
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
        )}
      </div>
    </div>
  );
} 