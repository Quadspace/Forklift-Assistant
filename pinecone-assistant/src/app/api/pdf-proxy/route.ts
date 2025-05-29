import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../utils/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pdfUrl = searchParams.get('url');

  if (!pdfUrl) {
    logger.error('PDF proxy called without URL parameter');
    return NextResponse.json({ 
      error: 'Missing PDF URL parameter',
      details: 'The "url" query parameter is required',
      example: '/api/pdf-proxy?url=https://example.com/document.pdf'
    }, { status: 400 });
  }

  try {
    // Decode the URL and validate it
    const decodedUrl = decodeURIComponent(pdfUrl);
    
    // Basic URL validation before creating URL object
    if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
      logger.error('Invalid URL protocol provided to PDF proxy', { 
        originalUrl: pdfUrl,
        decodedUrl
      });
      return NextResponse.json({ 
        error: 'Invalid URL protocol',
        details: `URLs must start with http:// or https://. Received: "${decodedUrl.substring(0, 50)}..."`,
        originalUrl: pdfUrl
      }, { status: 400 });
    }
    
    // Validate URL format
    let urlObj;
    try {
      urlObj = new URL(decodedUrl);
    } catch (urlError) {
      logger.error('Invalid URL format provided to PDF proxy', { 
        originalUrl: pdfUrl,
        decodedUrl,
        error: urlError instanceof Error ? urlError.message : String(urlError)
      });
      return NextResponse.json({ 
        error: 'Invalid URL format',
        details: `The provided URL "${decodedUrl.substring(0, 100)}..." is not a valid URL`,
        originalUrl: pdfUrl,
        suggestion: 'Ensure the URL is properly encoded and includes protocol (http:// or https://)'
      }, { status: 400 });
    }
    
    logger.info('Proxying PDF request', { 
      url: decodedUrl.substring(0, 100) + '...',
      host: urlObj.hostname,
      protocol: urlObj.protocol
    });

    // Fetch the PDF from the original URL with enhanced headers
    const response = await fetch(decodedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Forklift-Assistant-PDF-Proxy/1.0',
        'Accept': 'application/pdf,*/*',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (!response.ok) {
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        url: decodedUrl.substring(0, 100) + '...',
        headers: Object.fromEntries(response.headers.entries())
      };
      
      logger.error('Failed to fetch PDF from source', errorDetails);
      
      // Provide specific error messages based on status code
      let userMessage = `Failed to fetch PDF: ${response.status} ${response.statusText}`;
      if (response.status === 403) {
        userMessage = 'Access denied to PDF file. The signed URL may have expired or permissions are insufficient.';
      } else if (response.status === 404) {
        userMessage = 'PDF file not found. The document may have been moved or deleted.';
      } else if (response.status === 401) {
        userMessage = 'Authentication required to access PDF file.';
      }
      
      return NextResponse.json({
        error: userMessage,
        details: errorDetails,
        troubleshooting: {
          '403_forbidden': 'Try refreshing the page to get a new signed URL',
          '404_not_found': 'Verify the file still exists in your Pinecone assistant',
          '401_unauthorized': 'Check your Pinecone API credentials'
        }
      }, { status: response.status });
    }

    // Validate content type
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/pdf') && !contentType.includes('application/octet-stream')) {
      logger.warn('Response does not appear to be a PDF', { 
        contentType,
        url: decodedUrl.substring(0, 100) + '...'
      });
    }

    // Get the PDF content
    const pdfBuffer = await response.arrayBuffer();
    
    if (pdfBuffer.byteLength === 0) {
      logger.error('Received empty PDF response');
      return NextResponse.json({
        error: 'Empty PDF file received',
        details: 'The PDF file appears to be empty or corrupted'
      }, { status: 502 });
    }
    
    logger.info('PDF fetched successfully', { 
      size: pdfBuffer.byteLength,
      contentType: response.headers.get('content-type'),
      url: decodedUrl.substring(0, 100) + '...'
    });

    // Return the PDF with proper headers
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.byteLength.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'X-PDF-Proxy': 'Forklift-Assistant',
        'X-Original-URL': decodedUrl.substring(0, 200), // Include original URL for debugging
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('Error proxying PDF', { 
      error: errorMessage,
      url: pdfUrl.substring(0, 100) + '...',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json({
      error: 'Failed to proxy PDF request',
      details: errorMessage,
      originalUrl: pdfUrl,
      troubleshooting: {
        network_error: 'Check your internet connection and try again',
        timeout_error: 'The PDF file may be too large or the server is slow',
        cors_error: 'The PDF source may not allow cross-origin requests'
      }
    }, { status: 500 });
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
} 