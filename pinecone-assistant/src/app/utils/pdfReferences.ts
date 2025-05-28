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
  console.log('🚨 DETECT PDF REFERENCES FUNCTION CALLED! 🚨');
  console.log('🔍 detectPageReferences called with content:', content);
  
  const references: PDFReference[] = [];
  
  // Enhanced patterns for different reference formats
  const patterns = [
    // Bracket citations with page ranges: [5, pp. 25-31], [2, p. 42], [1, pages 15-20]
    // Simplified and more robust pattern
    {
      regex: /\[(\d+),\s*pp\.\s*(\d+)-(\d+)\]/gi,
      handler: (match: RegExpMatchArray, index: number) => {
        console.log('📋 Bracket citation match found:', match[0], 'at index', index);
        const docNumber = parseInt(match[1], 10);
        const startPage = parseInt(match[2], 10);
        const endPage = parseInt(match[3], 10);
        
        const ref = {
          fullMatch: match[0],
          matchIndex: index,
          startPage,
          endPage,
          documentNumber: docNumber,
          searchText: `Document ${docNumber}, pages ${startPage}-${endPage}`
        };
        
        console.log('📋 Created reference:', ref);
        references.push(ref);
      }
    },
    
    // Simple bracket citations: [5], [2], [1]
    {
      regex: /\[(\d+)\]/g,
      handler: (match: RegExpMatchArray, index: number) => {
        // Skip if this is part of a page range citation
        const beforeMatch = content.substring(Math.max(0, index - 5), index);
        const afterMatch = content.substring(index + match[0].length, index + match[0].length + 10);
        
        if (beforeMatch.includes('pp.') || afterMatch.includes('pp.')) {
          return; // Skip this match as it's part of a page range citation
        }
        
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
    console.log(`🎯 Applying pattern ${patternIndex + 1}:`, pattern.regex);
    
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      console.log(`✅ Pattern ${patternIndex + 1} found match:`, match[0], 'at index', match.index);
      pattern.handler(match, match.index);
      
      // Prevent infinite loop for global regex
      if (!pattern.regex.global) {
        break;
      }
    }
  });
  
  console.log(`📊 Total references found: ${references.length}`);
  console.log('📋 All references:', references);
  
  // Sort references by their position in the text (reverse order for processing)
  return references.sort((a, b) => b.matchIndex - a.matchIndex);
}

/**
 * Finds a matching PDF file from the available files list
 * Supports matching by document number, filename, or partial name matching
 */
export function findMatchingPDFFile(reference: PDFReference, files: any[], referencedFiles?: any[]): any | null {
  console.log('🔍 findMatchingPDFFile called with reference:', reference);
  console.log('📁 Available PDF files:', files.length);
  console.log('🗂️ First file structure:', files[0]);
  console.log('🔗 Files with signed_url:', files.filter(f => f.signed_url).length);
  console.log('📋 Referenced files with URLs:', referencedFiles?.length || 0);
  
  if (!files || files.length === 0) {
    return null;
  }
  
  // Sort files consistently for document number matching
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  console.log('📋 Sorted files:', sortedFiles.map(f => f.name));
  
  // Method 1: Match by document number (for bracket citations)
  if (reference.documentNumber && reference.documentNumber > 0 && reference.documentNumber <= sortedFiles.length) {
    console.log(`🎯 Trying to match document reference: "reference ${reference.documentNumber}"`);
    console.log(`🔢 Trying to match reference ${reference.documentNumber} with available files`);
    console.log('📋 Sorted files:', sortedFiles.map(f => f.name));
    
    const matchedFile = sortedFiles[reference.documentNumber - 1];
    console.log(`✅ Matched file by reference number: ${matchedFile.name}`);
    console.log(`🔗 Matched file signed_url:`, matchedFile.signed_url ? 'Present' : 'MISSING');
    
    // If the matched file doesn't have signed_url, try to find it in referencedFiles
    if (!matchedFile.signed_url && referencedFiles) {
      console.log('🔄 Trying to find signed URL in referenced files...');
      const referencedFile = referencedFiles.find(ref => 
        ref.name && matchedFile.name && (
          ref.name.toLowerCase().includes(matchedFile.name.toLowerCase()) ||
          matchedFile.name.toLowerCase().includes(ref.name.toLowerCase())
        )
      );
      
      if (referencedFile && referencedFile.url) {
        console.log(`✅ Found signed URL in referenced files: ${referencedFile.name}`);
        return {
          ...matchedFile,
          signed_url: referencedFile.url
        };
      }
    }
    
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