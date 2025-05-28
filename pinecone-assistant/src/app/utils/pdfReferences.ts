/**
 * Enhanced PDF reference detection utility
 * Detects various formats of PDF references in text and extracts page information
 */

export interface PDFReference {
  fullMatch: string;
  matchIndex: number;
  startPage: number;
  endPage: number;
  documentNumber?: number;
  fileName?: string;
  searchText?: string;
}

/**
 * Detects PDF page references in text content
 * Supports multiple formats including bracket citations, page ranges, and direct PDF mentions
 */
export function detectPageReferences(content: string): PDFReference[] {
  const references: PDFReference[] = [];
  
  // Enhanced patterns for different reference formats
  const patterns = [
    // Bracket citations with page ranges: [5, pp. 25-31], [2, p. 42], [1, pages 15-20]
    {
      regex: /\[(\d+),?\s*(?:pp?\.?|pages?)\s*(\d+)(?:\s*[-–—]\s*(\d+))?\]/gi,
      handler: (match: RegExpMatchArray, index: number) => {
        const docNumber = parseInt(match[1], 10);
        const startPage = parseInt(match[2], 10);
        const endPage = match[3] ? parseInt(match[3], 10) : startPage;
        
        const ref = {
          fullMatch: match[0],
          matchIndex: index,
          startPage,
          endPage,
          documentNumber: docNumber,
          searchText: `Document ${docNumber}, pages ${startPage}${endPage !== startPage ? `-${endPage}` : ''}`
        };
        
        references.push(ref);
      }
    },
    
    // Simple bracket citations: [5], [2], [1]
    {
      regex: /\[(\d+)\]/g,
      handler: (match: RegExpMatchArray, index: number) => {
        const docNumber = parseInt(match[1], 10);
        
        references.push({
          fullMatch: match[0],
          matchIndex: index,
          startPage: 1,
          endPage: 1,
          documentNumber: docNumber,
          searchText: `Document ${docNumber}`
        });
      }
    },
    
    // Page references: pp. 25-31, p. 42, pages 15-20
    {
      regex: /(?:pp?\.?|pages?)\s*(\d+)(?:\s*[-–—]\s*(\d+))?/gi,
      handler: (match: RegExpMatchArray, index: number) => {
        const startPage = parseInt(match[1], 10);
        const endPage = match[2] ? parseInt(match[2], 10) : startPage;
        
        references.push({
          fullMatch: match[0],
          matchIndex: index,
          startPage,
          endPage,
          searchText: `Pages ${startPage}${endPage !== startPage ? `-${endPage}` : ''}`
        });
      }
    },
    
    // Direct PDF filename mentions: WP2000S.pdf, manual.pdf
    {
      regex: /([A-Za-z0-9_\-\s]+\.pdf)/gi,
      handler: (match: RegExpMatchArray, index: number) => {
        const fileName = match[1].trim();
        
        references.push({
          fullMatch: match[0],
          matchIndex: index,
          startPage: 1,
          endPage: 1,
          fileName,
          searchText: fileName.replace('.pdf', '')
        });
      }
    },
    
    // Document references with pages: WP 2000 p. 23, Manual page 45
    {
      regex: /([A-Za-z0-9_\-\s]+)\s+(?:p\.?|page)\s*(\d+)/gi,
      handler: (match: RegExpMatchArray, index: number) => {
        const docName = match[1].trim();
        const pageNum = parseInt(match[2], 10);
        
        references.push({
          fullMatch: match[0],
          matchIndex: index,
          startPage: pageNum,
          endPage: pageNum,
          fileName: docName,
          searchText: `${docName} page ${pageNum}`
        });
      }
    }
  ];
  
  // Apply each pattern to find references
  patterns.forEach((pattern, patternIndex) => {
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      pattern.handler(match, match.index);
      
      // Prevent infinite loop for global regex
      if (!pattern.regex.global) {
        break;
      }
    }
  });
  
  // Sort references by their position in the text (reverse order for processing)
  return references.sort((a, b) => b.matchIndex - a.matchIndex);
}

/**
 * Finds a matching PDF file from the available files list
 * Supports matching by document number, filename, or partial name matching
 */
export function findMatchingPDFFile(reference: PDFReference, files: any[]): any | null {
  if (!files || files.length === 0) {
    return null;
  }
  
  // Sort files consistently for document number matching
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  
  // Method 1: Match by document number (for bracket citations)
  if (reference.documentNumber && reference.documentNumber > 0 && reference.documentNumber <= sortedFiles.length) {
    const matchedFile = sortedFiles[reference.documentNumber - 1];
    return matchedFile;
  }
  
  // Method 2: Match by exact filename
  if (reference.fileName) {
    const exactMatch = files.find(file => 
      file.name.toLowerCase() === reference.fileName!.toLowerCase() ||
      file.name.toLowerCase().includes(reference.fileName!.toLowerCase())
    );
    
    if (exactMatch) {
      return exactMatch;
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
      return partialMatch;
    }
  }
  
  // Method 4: Default to first file if no specific match found (for simple page references)
  if (!reference.documentNumber && !reference.fileName && files.length > 0) {
    return sortedFiles[0];
  }
  
  return null;
}