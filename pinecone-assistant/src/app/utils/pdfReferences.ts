/**
 * Enhanced PDF reference detection utility
 * Detects various formats of PDF references in text and extracts page information
 */

import { logger } from './logger';

export interface PDFReference {
  fullMatch: string;
  matchIndex: number;
  startPage: number;
  endPage: number;
  documentNumber?: number;
  fileName?: string;
  searchText?: string;
  confidence: number; // 0-1 confidence score for the match
}

/**
 * Detects PDF page references in text content with improved accuracy
 * Supports multiple formats including bracket citations, page ranges, and direct PDF mentions
 */
export function detectPageReferences(content: string): PDFReference[] {
  logger.debug('🔍 detectPageReferences called', { contentLength: content.length });
  
  if (!content || typeof content !== 'string') {
    logger.warn('Invalid content provided to detectPageReferences');
    return [];
  }
  
  const references: PDFReference[] = [];
  
  // Enhanced patterns with confidence scoring
  const patterns = [
    // High confidence: Bracket citations with page ranges: [5, pp. 25-31], [2, p. 42]
    {
      regex: /\[(\d+),\s*pp?\.\s*(\d+)(?:\s*[-–—]\s*(\d+))?\]/gi,
      confidence: 0.95,
      handler: (match: RegExpMatchArray, index: number) => {
        const docNumber = parseInt(match[1], 10);
        const startPage = parseInt(match[2], 10);
        const endPage = match[3] ? parseInt(match[3], 10) : startPage;
        
        // Validate page numbers
        if (startPage < 1 || endPage < startPage || endPage > 10000) {
          logger.debug('Invalid page range detected, skipping', { startPage, endPage });
          return;
        }
        
        const ref: PDFReference = {
          fullMatch: match[0],
          matchIndex: index,
          startPage,
          endPage,
          documentNumber: docNumber,
          searchText: `Document ${docNumber}, pages ${startPage}${endPage !== startPage ? `-${endPage}` : ''}`,
          confidence: 0.95
        };
        
        logger.debug('📋 High-confidence bracket citation found:', ref);
        references.push(ref);
      }
    },
    
    // Medium confidence: Simple bracket citations: [5], [2], [1]
    {
      regex: /\[(\d+)\]/g,
      confidence: 0.7,
      handler: (match: RegExpMatchArray, index: number) => {
        // Skip if this is part of a page range citation
        const beforeMatch = content.substring(Math.max(0, index - 10), index);
        const afterMatch = content.substring(index + match[0].length, index + match[0].length + 15);
        
        if (beforeMatch.includes('pp.') || afterMatch.includes('pp.') || afterMatch.includes('p.')) {
          return; // Skip this match as it's part of a page range citation
        }
        
        const docNumber = parseInt(match[1], 10);
        
        // Validate document number
        if (docNumber < 1 || docNumber > 100) {
          logger.debug('Invalid document number, skipping', { docNumber });
          return;
        }
        
        references.push({
          fullMatch: match[0],
          matchIndex: index,
          startPage: 1,
          endPage: 1,
          documentNumber: docNumber,
          searchText: `Document ${docNumber}`,
          confidence: 0.7
        });
      }
    },
    
    // Medium confidence: Page references: pp. 25-31, p. 42, pages 15-20
    {
      regex: /(?:pp?\.?|pages?)\s*(\d+)(?:\s*[-–—]\s*(\d+))?/gi,
      confidence: 0.8,
      handler: (match: RegExpMatchArray, index: number) => {
        const startPage = parseInt(match[1], 10);
        const endPage = match[2] ? parseInt(match[2], 10) : startPage;
        
        // Validate page numbers
        if (startPage < 1 || endPage < startPage || endPage > 10000) {
          logger.debug('Invalid page range detected, skipping', { startPage, endPage });
          return;
        }
        
        references.push({
          fullMatch: match[0],
          matchIndex: index,
          startPage,
          endPage,
          searchText: `Pages ${startPage}${endPage !== startPage ? `-${endPage}` : ''}`,
          confidence: 0.8
        });
      }
    },
    
    // Lower confidence: Direct PDF filename mentions: WP2000S.pdf, manual.pdf
    {
      regex: /([A-Za-z0-9_\-\s]{2,50}\.pdf)/gi,
      confidence: 0.6,
      handler: (match: RegExpMatchArray, index: number) => {
        const fileName = match[1].trim();
        
        // Skip very short or very long filenames
        if (fileName.length < 5 || fileName.length > 100) {
          return;
        }
        
        references.push({
          fullMatch: match[0],
          matchIndex: index,
          startPage: 1,
          endPage: 1,
          fileName,
          searchText: fileName.replace('.pdf', ''),
          confidence: 0.6
        });
      }
    }
  ];
  
  // Apply each pattern to find references
  patterns.forEach((pattern, patternIndex) => {
    logger.debug(`🎯 Applying pattern ${patternIndex + 1}`, { regex: pattern.regex.source });
    
    try {
      let match;
      let matchCount = 0;
      const maxMatches = 50; // Prevent infinite loops
      
      while ((match = pattern.regex.exec(content)) !== null && matchCount < maxMatches) {
        logger.debug(`✅ Pattern ${patternIndex + 1} found match: ${match[0]} at index ${match.index}`);
        pattern.handler(match, match.index);
        matchCount++;
        
        // Prevent infinite loop for global regex
        if (!pattern.regex.global) {
          break;
        }
      }
      
      if (matchCount >= maxMatches) {
        logger.warn(`Pattern ${patternIndex + 1} reached maximum matches limit`);
      }
    } catch (error) {
      logger.error(`Error applying pattern ${patternIndex + 1}`, error);
    }
  });
  
  // Sort references by confidence (highest first), then by position
  const sortedReferences = references.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }
    return b.matchIndex - a.matchIndex;
  });
  
  // Remove duplicates and overlapping matches
  const uniqueReferences = removeDuplicateReferences(sortedReferences);
  
  logger.info(`📊 PDF reference detection complete`, { 
    totalFound: references.length,
    afterDeduplication: uniqueReferences.length,
    highConfidence: uniqueReferences.filter(r => r.confidence > 0.8).length
  });
  
  return uniqueReferences;
}

/**
 * Remove duplicate and overlapping references
 */
function removeDuplicateReferences(references: PDFReference[]): PDFReference[] {
  const unique: PDFReference[] = [];
  
  for (const ref of references) {
    // Check if this reference overlaps with any existing reference
    const hasOverlap = unique.some(existing => {
      // Check for exact match
      if (existing.fullMatch === ref.fullMatch && existing.matchIndex === ref.matchIndex) {
        return true;
      }
      
      // Check for overlapping text ranges
      const existingStart = existing.matchIndex;
      const existingEnd = existing.matchIndex + existing.fullMatch.length;
      const refStart = ref.matchIndex;
      const refEnd = ref.matchIndex + ref.fullMatch.length;
      
      // If ranges overlap, keep the one with higher confidence
      if ((refStart < existingEnd && refEnd > existingStart)) {
        if (ref.confidence > existing.confidence) {
          // Remove the existing lower-confidence reference
          const index = unique.indexOf(existing);
          unique.splice(index, 1);
          return false; // Don't skip this reference
        }
        return true; // Skip this reference
      }
      
      return false;
    });
    
    if (!hasOverlap) {
      unique.push(ref);
    }
  }
  
  // Sort by position for consistent processing
  return unique.sort((a, b) => a.matchIndex - b.matchIndex);
}

/**
 * Finds a matching PDF file from the available files list
 * Supports matching by document number, filename, or partial name matching
 */
export function findMatchingPDFFile(reference: PDFReference, files: any[], referencedFiles?: any[]): any | null {
  logger.info('🔍 findMatchingPDFFile called with reference:', reference);
  logger.info('📁 Available PDF files:', files.length);
  logger.info('🗂️ First file structure:', files[0]);
  logger.info('🔗 Files with signed_url:', files.filter(f => f.signed_url).length);
  logger.info('📋 Referenced files with URLs:', referencedFiles?.length || 0);
  
  if (!files || files.length === 0) {
    return null;
  }
  
  // Helper function to find signed URL from referenced files
  const findSignedUrlInReferences = (fileName: string): string | null => {
    if (!referencedFiles) return null;
    
    const referencedFile = referencedFiles.find(ref => {
      if (!ref.name || !fileName) return false;
      
      const refNameClean = ref.name.toLowerCase().replace(/[_\-\s]+/g, '').replace('.pdf', '');
      const fileNameClean = fileName.toLowerCase().replace(/[_\-\s]+/g, '').replace('.pdf', '');
      
      return refNameClean.includes(fileNameClean) || 
             fileNameClean.includes(refNameClean) ||
             ref.name.toLowerCase() === fileName.toLowerCase();
    });
    
    return referencedFile?.url || null;
  };
  
  // Helper function to ensure file has signed_url
  const ensureSignedUrl = (file: any): any => {
    if (file.signed_url) {
      logger.info(`✅ File ${file.name} already has signed_url`);
      return file;
    }
    
    logger.info(`⚠️ File ${file.name} missing signed_url, looking for alternatives...`);
    
    // Try to find signed URL in referenced files
    const foundUrl = findSignedUrlInReferences(file.name);
    if (foundUrl) {
      logger.info(`✅ Found signed URL in referenced files for ${file.name}`);
      return {
        ...file,
        signed_url: foundUrl
      };
    }
    
    // If no signed URL found, create a fallback using the file ID
    if (file.id) {
      logger.info(`🔄 Creating fallback URL for ${file.name} using file ID`);
      const fallbackUrl = `/api/files/${file.id}/download`;
      return {
        ...file,
        signed_url: fallbackUrl
      };
    }
    
    logger.error(`❌ Could not generate signed_url for file: ${file.name}`);
    return null;
  };
  
  // Sort files consistently for document number matching
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  logger.info('📋 Sorted files:', sortedFiles.map(f => f.name));
  
  // Method 1: Match by document number (for bracket citations)
  if (reference.documentNumber && reference.documentNumber > 0 && reference.documentNumber <= sortedFiles.length) {
    logger.info(`🎯 Trying to match document reference: "reference ${reference.documentNumber}"`);
    logger.info(`🔢 Trying to match reference ${reference.documentNumber} with available files`);
    
    const matchedFile = sortedFiles[reference.documentNumber - 1];
    logger.info(`✅ Matched file by reference number: ${matchedFile.name}`);
    
    return ensureSignedUrl(matchedFile);
  }
  
  // Method 2: Match by exact filename
  if (reference.fileName) {
    const exactMatch = files.find(file => 
      file.name.toLowerCase() === reference.fileName!.toLowerCase() ||
      file.name.toLowerCase().includes(reference.fileName!.toLowerCase())
    );
    
    if (exactMatch) {
      logger.info(`✅ Found exact filename match: ${exactMatch.name}`);
      return ensureSignedUrl(exactMatch);
    }
  }
  
  // Method 3: Partial matching for document names
  if (reference.fileName) {
    const partialMatch = files.find(file => {
      const fileName = file.name.toLowerCase();
      const refName = reference.fileName!.toLowerCase();
      
      // Remove common words and extensions for better matching
      const cleanFileName = fileName.replace(/\.(pdf|doc|docx)$/i, '').replace(/[_\-\s]+/g, ' ');
      const cleanRefName = refName.replace(/\.(pdf|doc|docx)$/i, '').replace(/[_\-\s]+/g, ' ');
      
      return cleanFileName.includes(cleanRefName) || cleanRefName.includes(cleanFileName);
    });
    
    if (partialMatch) {
      logger.info(`✅ Found partial filename match: ${partialMatch.name}`);
      return ensureSignedUrl(partialMatch);
    }
  }
  
  // Method 4: Default to first file if no specific match found (for simple page references)
  if (!reference.documentNumber && !reference.fileName && files.length > 0) {
    logger.info(`🔄 Using default first file: ${sortedFiles[0].name}`);
    return ensureSignedUrl(sortedFiles[0]);
  }
  
  logger.info(`❌ No matching file found for reference`);
  return null;
}