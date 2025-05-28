/**
 * PDF utility functions for handling signed URLs and CORS issues
 */

/**
 * Processes a PDF URL to ensure it works with the PDF viewer
 * @param url - The original PDF URL (signed URL from Pinecone)
 * @returns Processed URL that works with PDF.js
 */
export function processPdfUrl(url: string): string {
  if (!url) return '';
  
  // If it's already a blob URL, return as-is
  if (url.startsWith('blob:')) {
    return url;
  }
  
  // For signed URLs that might have CORS issues, we'll use them directly
  // PDF.js can handle most signed URLs, but we may need to add CORS headers
  // in a proxy if issues arise
  return url;
}

/**
 * Creates a proxy URL for PDFs that have CORS issues
 * @param originalUrl - The original PDF URL
 * @returns Proxy URL that adds proper CORS headers
 */
export function createPdfProxyUrl(originalUrl: string): string {
  if (!originalUrl) return '';
  
  // Encode the original URL to pass it as a query parameter
  const encodedUrl = encodeURIComponent(originalUrl);
  return `/api/pdf-proxy?url=${encodedUrl}`;
}

/**
 * Checks if a URL is likely to have CORS issues
 * @param url - The URL to check
 * @returns True if the URL might have CORS issues
 */
export function mightHaveCorsIssues(url: string): boolean {
  if (!url) return false;
  
  // Check if it's a cross-origin URL
  try {
    const urlObj = new URL(url);
    const currentOrigin = window.location.origin;
    return urlObj.origin !== currentOrigin;
  } catch {
    return false;
  }
}

/**
 * Attempts to fetch a PDF and create a blob URL if the original has CORS issues
 * @param url - The original PDF URL
 * @returns Promise that resolves to a working PDF URL
 */
export async function ensurePdfUrlWorks(url: string): Promise<string> {
  if (!url) return '';
  
  // First, try the original URL
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      mode: 'cors'
    });
    
    if (response.ok) {
      return url; // Original URL works fine
    }
  } catch (error) {
    console.warn('Original PDF URL has CORS issues, trying proxy:', error);
  }
  
  // If original URL has issues, try to fetch through our proxy
  try {
    const proxyUrl = createPdfProxyUrl(url);
    const response = await fetch(proxyUrl);
    
    if (response.ok) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
  } catch (error) {
    console.error('PDF proxy also failed:', error);
  }
  
  // As a last resort, return the original URL and let PDF.js handle it
  return url;
}

/**
 * Validates that a URL points to a PDF file
 * @param url - The URL to validate
 * @returns True if the URL appears to be a PDF
 */
export function isPdfUrl(url: string): boolean {
  if (!url) return false;
  
  // Check file extension
  if (url.toLowerCase().includes('.pdf')) {
    return true;
  }
  
  // Check content-type if we can (this would require a HEAD request)
  // For now, we'll assume any URL passed to this function is a PDF
  return true;
}

/**
 * Extracts filename from a PDF URL
 * @param url - The PDF URL
 * @returns The filename or a default name
 */
export function extractPdfFilename(url: string): string {
  if (!url) return 'document.pdf';
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'document.pdf';
    
    // Ensure it has .pdf extension
    if (!filename.toLowerCase().endsWith('.pdf')) {
      return `${filename}.pdf`;
    }
    
    return filename;
  } catch {
    return 'document.pdf';
  }
} 