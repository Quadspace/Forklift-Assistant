import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../utils/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pdfUrl = searchParams.get('url');

  if (!pdfUrl) {
    return NextResponse.json({ error: 'Missing PDF URL parameter' }, { status: 400 });
  }

  try {
    // Decode the URL
    const decodedUrl = decodeURIComponent(pdfUrl);
    
    logger.info('Proxying PDF request', { url: decodedUrl.substring(0, 100) + '...' });

    // Fetch the PDF from the original URL
    const response = await fetch(decodedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Forklift-Assistant-PDF-Proxy/1.0',
        'Accept': 'application/pdf,*/*',
      },
    });

    if (!response.ok) {
      logger.error('Failed to fetch PDF', { 
        status: response.status, 
        statusText: response.statusText,
        url: decodedUrl.substring(0, 100) + '...'
      });
      return NextResponse.json(
        { error: `Failed to fetch PDF: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the PDF content
    const pdfBuffer = await response.arrayBuffer();
    
    logger.info('PDF fetched successfully', { 
      size: pdfBuffer.byteLength,
      contentType: response.headers.get('content-type')
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
      },
    });

  } catch (error) {
    logger.error('Error proxying PDF', { 
      error: error instanceof Error ? error.message : String(error),
      url: pdfUrl.substring(0, 100) + '...'
    });
    
    return NextResponse.json(
      { error: 'Failed to proxy PDF request' },
      { status: 500 }
    );
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