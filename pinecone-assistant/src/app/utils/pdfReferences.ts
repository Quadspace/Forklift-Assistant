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
  // Matches direct PDF filename references like "WP2000S.pdf", "manual.pdf", etc.
  {
    regex: /([A-Za-z0-9_\-\s]+\.pdf)/gi,
    extractPages: (match: RegExpExecArray) => {
      return {
        startPage: 1,
        endPage: 1,
        fullMatch: match[0],
        documentRef: match[1].trim()
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
  // Matches citation references like [1, pp.22-31] with flexible spacing
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
  },
  // Exact match for the format like "[1, pp. 22-31]" with space after comma and period
  {
    regex: /\[(\d+),\s+pp\.\s+(\d+)(?:\s*-\s*(\d+))?\]/gi,
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
  },
  // Matches another common citation format like [1] pp. 22-31
  {
    regex: /\[(\d+)\]\s+pp?\.?\s*(\d+)(?:\s*-\s*(\d+))?/gi,
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
  },
  // Matches simple citation references like [1] (uses default page 1)
  {
    regex: /\[(\d+)\](?!\s*\()/g,
    extractPages: (match: RegExpExecArray) => {
      const docNumber = match[1];
      return {
        startPage: 1,
        endPage: 1,
        fullMatch: match[0],
        documentRef: `Reference ${docNumber}`
      };
    }
  },
  // Matches citation references like [1] (pp. 22-31)
  {
    regex: /\[(\d+)\]\s*\(pp?\.?\s*(\d+)(?:\s*-\s*(\d+))?\)/gi,
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
  
  console.log('Starting detectPageReferences with text:', text.substring(0, 100) + '...');
  
  // Apply each regex pattern
  PAGE_REFERENCE_PATTERNS.forEach((pattern, index) => {
    console.log(`Trying pattern #${index}:`, pattern.regex);
    const regex = new RegExp(pattern.regex);
    let match: RegExpExecArray | null;
    
    // Find all matches in the text
    while ((match = regex.exec(text)) !== null) {
      console.log(`Pattern #${index} found match:`, match[0]);
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
  
  console.log(`Found ${references.length} references in total`);
  
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
  if (!files || files.length === 0) {
    console.log('No files available to match reference:', reference);
    return undefined;
  }
  
  // For files array debugging
  console.log('Available PDF files:', files.map(f => f.name));
  
  // If the reference has a document reference, try to match it with file names
  if (reference.documentRef) {
    const docRef = reference.documentRef.toLowerCase();
    console.log(`Trying to match document reference: "${docRef}"`);
    
    // For direct PDF filename references (like "WP2000S.pdf")
    if (docRef.endsWith('.pdf')) {
      const exactMatch = files.find(file => 
        file.name.toLowerCase() === docRef ||
        file.name.toLowerCase().includes(docRef.replace('.pdf', ''))
      );
      
      if (exactMatch) {
        console.log(`Found exact PDF filename match: ${exactMatch.name}`);
        return exactMatch;
      }
      
      // Try partial matching for PDF filenames
      const partialMatch = files.find(file => {
        const fileName = file.name.toLowerCase();
        const refName = docRef.replace('.pdf', '');
        return fileName.includes(refName) || refName.includes(fileName.replace('.pdf', ''));
      });
      
      if (partialMatch) {
        console.log(`Found partial PDF filename match: ${partialMatch.name}`);
        return partialMatch;
      }
    }
    
    // For numbered references like [1, pp.22-31], try to match with the first file
    if (docRef.startsWith('reference ')) {
      const refNumber = parseInt(docRef.replace('reference ', ''), 10);
      console.log(`Trying to match reference ${refNumber} with available files`);
      
      if (!isNaN(refNumber) && refNumber > 0 && files.length >= refNumber) {
        // Get files sorted alphabetically
        const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
        console.log('Sorted files:', sortedFiles.map(f => f.name));
        
        // Return the file at index refNumber-1 (0-based index for 1-based reference)
        const matchedFile = sortedFiles[refNumber - 1];
        console.log(`Matched file by reference number: ${matchedFile.name}`);
        return matchedFile;
      } else {
        console.log(`Reference number ${refNumber} is invalid or out of range`);
      }
    }
    
    // Standard document reference matching
    const matchedFile = files.find(file => 
      file.name.toLowerCase().includes(docRef) || 
      docRef.includes(file.name.toLowerCase().replace('.pdf', ''))
    );
    
    if (matchedFile) {
      console.log(`Matched file by name similarity: ${matchedFile.name}`);
      return matchedFile;
    } else {
      console.log(`No file matched document reference: "${docRef}"`);
    }
  }
  
  // If there's only one PDF file, use it
  const pdfFiles = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));
  if (pdfFiles.length === 1) {
    console.log(`Only one PDF file available, using it: ${pdfFiles[0].name}`);
    return pdfFiles[0];
  }
  
  // If we have fewer than 5 PDF files, just return the first one as a fallback
  if (pdfFiles.length > 0 && pdfFiles.length < 5) {
    console.log(`No specific match found, using first PDF as fallback: ${pdfFiles[0].name}`);
    return pdfFiles[0];
  }
  
  // Otherwise, we don't have enough context to determine which file
  console.log('No matching file found for reference');
  return undefined;
} 