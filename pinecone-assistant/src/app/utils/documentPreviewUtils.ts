import { PDFReference, detectPageReferences, findMatchingPDFFile } from './pdfReferences';

export interface EnhancedPageReference extends PDFReference {
  fileName?: string;
  fileId?: string;
  confidence: number;
  hasChunks?: boolean;
}

export interface DocumentPreviewContext {
  fileName: string;
  startPage: number;
  endPage?: number;
  searchText?: string;
  pdfUrl: string;
  confidence: number;
}

/**
 * Enhanced function to detect and enrich page references with file context
 * @param text - The text to search for page references
 * @param files - Array of available PDF files
 * @returns Array of enhanced page references with file context
 */
export function detectEnhancedPageReferences(text: string, files: any[]): EnhancedPageReference[] {
  const basicReferences = detectPageReferences(text);
  
  return basicReferences.map(ref => {
    const matchingFile = findMatchingPDFFile(ref, files);
    
    return {
      ...ref,
      fileName: matchingFile?.name,
      fileId: matchingFile?.id,
      confidence: calculateReferenceConfidence(ref, matchingFile, text),
      hasChunks: false // Will be updated when chunks are fetched
    };
  });
}

/**
 * Calculate confidence score for a page reference match
 * @param reference - The page reference
 * @param matchingFile - The matched file (if any)
 * @param originalText - The original text context
 * @returns Confidence score between 0 and 1
 */
function calculateReferenceConfidence(
  reference: PDFReference, 
  matchingFile: any, 
  originalText: string
): number {
  let confidence = 0.5; // Base confidence
  
  // Boost confidence if we have a document reference
  if (reference.documentNumber) {
    confidence += 0.2;
  }
  
  // Boost confidence if we found a matching file
  if (matchingFile) {
    confidence += 0.2;
  }
  
  // Boost confidence if the reference includes specific page numbers
  if (reference.startPage > 1 || (reference.endPage && reference.endPage > reference.startPage)) {
    confidence += 0.1;
  }
  
  // Boost confidence if the reference appears in a structured format
  if (reference.fullMatch.includes('[') && reference.fullMatch.includes(']')) {
    confidence += 0.1;
  }
  
  // Reduce confidence if the reference is very generic
  if (reference.fullMatch.length < 5) {
    confidence -= 0.1;
  }
  
  return Math.min(1.0, Math.max(0.1, confidence));
}

/**
 * Create document preview contexts from enhanced references
 * @param enhancedReferences - Array of enhanced page references
 * @param files - Array of available files
 * @returns Array of document preview contexts
 */
export function createDocumentPreviewContexts(
  enhancedReferences: EnhancedPageReference[],
  files: any[]
): DocumentPreviewContext[] {
  const contexts: DocumentPreviewContext[] = [];
  
  // Group references by file
  const referencesByFile = new Map<string, EnhancedPageReference[]>();
  
  enhancedReferences.forEach(ref => {
    if (ref.fileName) {
      const existing = referencesByFile.get(ref.fileName) || [];
      existing.push(ref);
      referencesByFile.set(ref.fileName, existing);
    }
  });
  
  // Create contexts for each file
  referencesByFile.forEach((refs, fileName) => {
    const file = files.find(f => f.name === fileName);
    if (!file || !file.signed_url) return;
    
    // Merge overlapping page ranges
    const mergedRanges = mergePageRanges(refs);
    
    mergedRanges.forEach(range => {
      contexts.push({
        fileName: fileName,
        startPage: range.startPage,
        endPage: range.endPage,
        searchText: extractSearchText(refs, range),
        pdfUrl: file.signed_url,
        confidence: Math.max(...refs.map(r => r.confidence))
      });
    });
  });
  
  // Sort by confidence (highest first)
  return contexts.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Merge overlapping or adjacent page ranges
 * @param references - Array of page references
 * @returns Array of merged page ranges
 */
function mergePageRanges(references: EnhancedPageReference[]): Array<{startPage: number, endPage?: number}> {
  if (references.length === 0) return [];
  
  // Sort by start page
  const sorted = references.sort((a, b) => a.startPage - b.startPage);
  const merged: Array<{startPage: number, endPage?: number}> = [];
  
  let current = {
    startPage: sorted[0].startPage,
    endPage: sorted[0].endPage
  };
  
  for (let i = 1; i < sorted.length; i++) {
    const ref = sorted[i];
    const currentEnd = current.endPage || current.startPage;
    const refEnd = ref.endPage || ref.startPage;
    
    // Check if ranges overlap or are adjacent (within 2 pages)
    if (ref.startPage <= currentEnd + 2) {
      // Merge ranges
      current.endPage = Math.max(currentEnd, refEnd);
    } else {
      // Start new range
      merged.push(current);
      current = {
        startPage: ref.startPage,
        endPage: ref.endPage
      };
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Extract search text from references for a given page range
 * @param references - Array of page references
 * @param range - The page range to extract search text for
 * @returns Combined search text
 */
function extractSearchText(
  references: EnhancedPageReference[], 
  range: {startPage: number, endPage?: number}
): string {
  const relevantRefs = references.filter(ref => {
    const refEnd = ref.endPage || ref.startPage;
    const rangeEnd = range.endPage || range.startPage;
    
    return (ref.startPage <= rangeEnd && refEnd >= range.startPage);
  });
  
  // Extract meaningful search terms from the references
  const searchTerms = new Set<string>();
  
  relevantRefs.forEach(ref => {
    if (ref.searchText) {
      // Extract meaningful parts from search text
      const cleanRef = ref.searchText
        .replace(/^Reference\s+\d+/i, '')
        .replace(/^WP\s+\d+/i, '')
        .trim();
      
      if (cleanRef.length > 2) {
        searchTerms.add(cleanRef);
      }
    }
  });
  
  return Array.from(searchTerms).join(' ').trim();
}

/**
 * Check if a document preview should be automatically shown
 * @param context - Document preview context
 * @returns Whether to auto-show the preview
 */
export function shouldAutoShowPreview(context: DocumentPreviewContext): boolean {
  // Auto-show if confidence is high and it's a specific page range
  const hasHighConfidence = context.confidence > 0.7;
  const hasSpecificPageRange = context.startPage > 1 || 
    (context.endPage !== undefined && context.endPage > context.startPage);
  
  return hasHighConfidence && hasSpecificPageRange;
}

/**
 * Format a page range for display
 * @param startPage - Start page number
 * @param endPage - End page number (optional)
 * @returns Formatted page range string
 */
export function formatPageRange(startPage: number, endPage?: number): string {
  if (!endPage || endPage === startPage) {
    return `p. ${startPage}`;
  }
  return `pp. ${startPage}-${endPage}`;
} 