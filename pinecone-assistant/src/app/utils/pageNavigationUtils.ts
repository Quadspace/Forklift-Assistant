/**
 * Utility functions for parsing page numbers from reference text and handling automatic page navigation
 */

import { logger } from './logger';

export interface PageRange {
  startPage: number;
  endPage?: number;
  confidence: number;
}

/**
 * Parse page numbers from reference text
 * Supports formats like: "pp. 313-325", "p. 42", "pages 15-20", "page 5"
 */
export function parsePageNumbers(text: string): PageRange | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Clean the text
  const cleanText = text.trim().toLowerCase();
  
  // Patterns for page number detection
  const patterns = [
    // High confidence: "pp. 313-325", "pp 313-325"
    {
      regex: /pp\.?\s*(\d+)\s*[-–—]\s*(\d+)/i,
      confidence: 0.95,
      handler: (match: RegExpMatchArray) => ({
        startPage: parseInt(match[1], 10),
        endPage: parseInt(match[2], 10),
        confidence: 0.95
      })
    },
    
    // High confidence: "pages 15-20", "page 15-20"
    {
      regex: /pages?\s+(\d+)\s*[-–—]\s*(\d+)/i,
      confidence: 0.9,
      handler: (match: RegExpMatchArray) => ({
        startPage: parseInt(match[1], 10),
        endPage: parseInt(match[2], 10),
        confidence: 0.9
      })
    },
    
    // Medium confidence: "p. 42", "p 42"
    {
      regex: /p\.?\s*(\d+)/i,
      confidence: 0.8,
      handler: (match: RegExpMatchArray) => ({
        startPage: parseInt(match[1], 10),
        confidence: 0.8
      })
    },
    
    // Medium confidence: "page 42"
    {
      regex: /page\s+(\d+)/i,
      confidence: 0.75,
      handler: (match: RegExpMatchArray) => ({
        startPage: parseInt(match[1], 10),
        confidence: 0.75
      })
    },
    
    // Lower confidence: standalone numbers that might be pages
    {
      regex: /\b(\d{1,4})\b/g,
      confidence: 0.3,
      handler: (match: RegExpMatchArray) => {
        const pageNum = parseInt(match[1], 10);
        // Only consider reasonable page numbers
        if (pageNum >= 1 && pageNum <= 9999) {
          return {
            startPage: pageNum,
            confidence: 0.3
          };
        }
        return null;
      }
    }
  ];

  let bestMatch: PageRange | null = null;

  for (const pattern of patterns) {
    const matches = cleanText.match(pattern.regex);
    if (matches) {
      const result = pattern.handler(matches);
      if (result && (!bestMatch || result.confidence > bestMatch.confidence)) {
        bestMatch = result;
      }
    }
  }

  if (bestMatch) {
    // Validate page numbers
    if (bestMatch.startPage < 1 || bestMatch.startPage > 9999) {
      logger.warn('Invalid start page number', { startPage: bestMatch.startPage, text });
      return null;
    }
    
    if (bestMatch.endPage && (bestMatch.endPage < bestMatch.startPage || bestMatch.endPage > 9999)) {
      logger.warn('Invalid end page number', { endPage: bestMatch.endPage, startPage: bestMatch.startPage, text });
      bestMatch.endPage = undefined;
    }

    logger.debug('Parsed page numbers from text', { 
      text: text.substring(0, 100), 
      result: bestMatch 
    });
  }

  return bestMatch;
}

/**
 * Extract page numbers from a PDF reference link or text
 * Handles various formats including URL parameters and text patterns
 */
export function extractPageFromReference(reference: string): PageRange | null {
  if (!reference) return null;

  // First try to extract from URL parameters if it's a link
  if (reference.includes('start=') || reference.includes('page=')) {
    try {
      const url = new URL(reference.includes('http') ? reference : `http://example.com${reference}`);
      const startPage = url.searchParams.get('start') || url.searchParams.get('page');
      const endPage = url.searchParams.get('end');
      
      if (startPage) {
        const start = parseInt(startPage, 10);
        const end = endPage ? parseInt(endPage, 10) : undefined;
        
        if (start >= 1) {
          return {
            startPage: start,
            endPage: end && end > start ? end : undefined,
            confidence: 0.95
          };
        }
      }
    } catch (error) {
      // Not a valid URL, continue with text parsing
    }
  }

  // Fall back to text parsing
  return parsePageNumbers(reference);
}

/**
 * Generate a user-friendly page range description
 */
export function formatPageRange(pageRange: PageRange): string {
  if (!pageRange) return '';
  
  if (pageRange.endPage && pageRange.endPage > pageRange.startPage) {
    return `pages ${pageRange.startPage}-${pageRange.endPage}`;
  }
  
  return `page ${pageRange.startPage}`;
}

/**
 * Check if a page number is within a given range
 */
export function isPageInRange(pageNumber: number, pageRange: PageRange): boolean {
  if (!pageRange) return false;
  
  if (pageRange.endPage) {
    return pageNumber >= pageRange.startPage && pageNumber <= pageRange.endPage;
  }
  
  return pageNumber === pageRange.startPage;
}

/**
 * Calculate the optimal starting page for a reference
 * Takes into account the confidence and context
 */
export function getOptimalStartPage(pageRange: PageRange, totalPages?: number): number {
  if (!pageRange) return 1;
  
  let startPage = pageRange.startPage;
  
  // Validate against total pages if available
  if (totalPages && startPage > totalPages) {
    logger.warn('Start page exceeds total pages', { startPage, totalPages });
    startPage = Math.max(1, totalPages);
  }
  
  return Math.max(1, startPage);
}

/**
 * Auto-scroll to a specific page in a PDF viewer
 * This is a helper function for smooth page navigation
 */
export function smoothScrollToPage(pageNumber: number, setCurrentPage: (page: number) => void, delay: number = 100) {
  // Add a small delay to ensure the PDF is loaded
  setTimeout(() => {
    logger.info('Auto-navigating to page', { pageNumber });
    setCurrentPage(pageNumber);
  }, delay);
}

/**
 * Parse reference text and extract both page numbers and search terms
 */
export function parseReferenceContext(referenceText: string): {
  pageRange: PageRange | null;
  searchTerms: string[];
  documentHint: string | null;
} {
  const pageRange = parsePageNumbers(referenceText);
  
  // Extract potential search terms (words that aren't page indicators)
  const searchTerms: string[] = [];
  const documentHint = null;
  
  // Remove page-related text and extract meaningful terms
  let cleanText = referenceText
    .replace(/pp?\.?\s*\d+(?:\s*[-–—]\s*\d+)?/gi, '') // Remove page references
    .replace(/pages?\s+\d+(?:\s*[-–—]\s*\d+)?/gi, '') // Remove page references
    .replace(/\[\d+\]/g, '') // Remove citation numbers
    .replace(/[,\[\]()]/g, ' ') // Remove punctuation
    .trim();
  
  // Split into words and filter meaningful terms
  const words = cleanText.split(/\s+/).filter(word => 
    word.length > 2 && 
    !/^\d+$/.test(word) && // Not just numbers
    !['the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with'].includes(word.toLowerCase())
  );
  
  searchTerms.push(...words.slice(0, 3)); // Take first 3 meaningful words
  
  return {
    pageRange,
    searchTerms,
    documentHint
  };
} 