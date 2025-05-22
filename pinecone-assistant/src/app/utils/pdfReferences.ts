/**
 * Regex patterns for detecting different types of page references in text
 */
export const PAGE_REFERENCE_PATTERNS = [
  // Matches patterns like "pp. 5-13", "p. 42", "page 7", "pages 8-10"
  {
    regex: /(pp?\.?\s*(\d+)(?:\s*-\s*(\d+))?)|(?:pages?\s+(\d+)(?:\s*-\s*(\d+))?)/gi,
    extractPages: (match: RegExpExecArray) => {
      // Check which capturing group has the page numbers
      const startPage = match[2] || match[4] || '1';
      const endPage = match[3] || match[5] || startPage;
      return {
        startPage: parseInt(startPage, 10),
        endPage: parseInt(endPage, 10),
        fullMatch: match[0]
      };
    }
  },
  // Matches WP document numbers with page references
  {
    regex: /(WP\s+\d+)(?:.*?)(?:p\.?\s*(\d+)(?:\s*-\s*(\d+))?)/gi,
    extractPages: (match: RegExpExecArray) => {
      const startPage = match[2] || '1';
      const endPage = match[3] || startPage;
      return {
        startPage: parseInt(startPage, 10),
        endPage: parseInt(endPage, 10),
        fullMatch: match[0],
        documentRef: match[1]
      };
    }
  },
  // Matches citation references like [1, pp.22-31]
  {
    regex: /\[(\d+),\s*pp?\.?\s*(\d+)(?:\s*-\s*(\d+))?\]/gi,
    extractPages: (match: RegExpExecArray) => {
      const docNumber = match[1];
      const startPage = match[2];
      const endPage = match[3] || startPage;
      return {
        startPage: parseInt(startPage, 10),
        endPage: parseInt(endPage, 10),
        fullMatch: match[0],
        documentRef: `Reference ${docNumber}`
      };
    }
  }
];

/**
 * Interface for a detected page reference
 */
export interface PageReference {
  startPage: number;
  endPage: number;
  fullMatch: string;
  documentRef?: string;
  matchIndex: number;
}

/**
 * Detects PDF page references in a text string
 * @param text - The text to search for page references
 * @returns Array of page references found
 */
export function detectPageReferences(text: string): PageReference[] {
  const references: PageReference[] = [];
  
  // Apply each regex pattern
  PAGE_REFERENCE_PATTERNS.forEach(pattern => {
    const regex = new RegExp(pattern.regex);
    let match: RegExpExecArray | null;
    
    // Find all matches in the text
    while ((match = regex.exec(text)) !== null) {
      const extracted = pattern.extractPages(match);
      references.push({
        startPage: extracted.startPage,
        endPage: extracted.endPage,
        fullMatch: extracted.fullMatch,
        documentRef: 'documentRef' in extracted ? extracted.documentRef as string : undefined,
        matchIndex: match.index
      });
    }
  });
  
  // Sort references by their position in the text
  return references.sort((a, b) => a.matchIndex - b.matchIndex);
}

/**
 * Finds a matching PDF file for a page reference
 * @param reference - The page reference
 * @param files - Array of available PDF files
 * @returns The matching PDF file or undefined if not found
 */
export function findMatchingPDFFile(reference: PageReference, files: any[]) {
  if (!files || files.length === 0) return undefined;
  
  // If the reference has a document reference, try to match it with file names
  if (reference.documentRef) {
    const docRef = reference.documentRef.toLowerCase();
    
    // For numbered references like [1, pp.22-31], try to match with the first file
    if (docRef.startsWith('reference ')) {
      const refNumber = parseInt(docRef.replace('reference ', ''), 10);
      if (!isNaN(refNumber) && refNumber > 0 && files.length >= refNumber) {
        // Get files sorted alphabetically
        const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
        // Return the file at index refNumber-1 (0-based index for 1-based reference)
        return sortedFiles[refNumber - 1];
      }
    }
    
    // Standard document reference matching
    return files.find(file => 
      file.name.toLowerCase().includes(docRef) || 
      docRef.includes(file.name.toLowerCase().replace('.pdf', ''))
    );
  }
  
  // If there's only one PDF file, use it
  const pdfFiles = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));
  if (pdfFiles.length === 1) {
    return pdfFiles[0];
  }
  
  // Otherwise, we don't have enough context to determine which file
  return undefined;
} 