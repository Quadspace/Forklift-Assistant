import { NextResponse } from 'next/server';
import { checkAssistantPrerequisites } from '../../../../utils/assistantUtils';
import { logger } from '../../../../utils/logger';
import { apiClient } from '../../../../utils/apiClient';
import { promises as fs } from 'fs';
import path from 'path';
import { cache } from '../../../../utils/cache';

// Cache directory for downloaded PDFs
const CACHE_DIR = path.join(process.cwd(), 'public', 'cache', 'pdfs');

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    logger.warn('Failed to create cache directory', { error });
  }
}

// Generate cache file path for a file ID
function getCacheFilePath(fileId: string, fileName: string): string {
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return path.join(CACHE_DIR, `${fileId}_${sanitizedFileName}`);
}

// Check if file exists in local cache
async function getFromLocalCache(fileId: string, fileName: string): Promise<Buffer | null> {
  try {
    const filePath = getCacheFilePath(fileId, fileName);
    const fileBuffer = await fs.readFile(filePath);
    logger.info('File retrieved from local cache', { fileId, fileName, size: fileBuffer.length });
    return fileBuffer;
  } catch (error) {
    logger.debug('File not found in local cache', { fileId, fileName });
    return null;
  }
}

// Save file to local cache
async function saveToLocalCache(fileId: string, fileName: string, buffer: Buffer): Promise<void> {
  try {
    await ensureCacheDir();
    const filePath = getCacheFilePath(fileId, fileName);
    await fs.writeFile(filePath, buffer);
    logger.info('File saved to local cache', { fileId, fileName, size: buffer.length, path: filePath });
  } catch (error) {
    logger.error('Failed to save file to local cache', { fileId, fileName, error });
  }
}

// Alternative download sources when Pinecone fails
async function downloadFromAlternativeSources(fileId: string, fileName: string): Promise<Buffer | null> {
  const sources = [
    // Try the proxy endpoint first
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/pdf-proxy?url=${encodeURIComponent(`/api/files/${fileId}/download`)}`,
    
    // Try direct Pinecone content endpoint with different auth
    `${process.env.PINECONE_ASSISTANT_URL}/assistant/files/${process.env.PINECONE_ASSISTANT_NAME}/${fileId}/content`,
    
    // Try signed URL refresh
    `${process.env.PINECONE_ASSISTANT_URL}/assistant/files/${process.env.PINECONE_ASSISTANT_NAME}/${fileId}`,
  ];

  for (const [index, sourceUrl] of sources.entries()) {
    try {
      logger.info(`Trying alternative source ${index + 1}`, { sourceUrl: sourceUrl.substring(0, 100) + '...', fileId });
      
      let response;
      if (index === 0) {
        // Use fetch for proxy endpoint with manual timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        try {
          response = await fetch(sourceUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/pdf,application/octet-stream,*/*',
              'User-Agent': 'Forklift-Assistant-Cache/1.0'
            },
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }
      } else {
        // Use apiClient for Pinecone endpoints
        const apiResponse = await apiClient.request<ArrayBuffer>(sourceUrl, {
          method: 'GET',
          headers: {
            'Api-Key': process.env.PINECONE_API_KEY!,
            'Accept': 'application/pdf,application/octet-stream,*/*'
          },
          timeout: 30000,
          retries: 1
        });
        
        if (apiResponse.data) {
          const buffer = Buffer.from(apiResponse.data);
          logger.info(`Successfully downloaded from alternative source ${index + 1}`, { 
            fileId, 
            fileName, 
            size: buffer.length 
          });
          return buffer;
        }
        continue;
      }

      if (response && response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        if (buffer.length > 0) {
          logger.info(`Successfully downloaded from alternative source ${index + 1}`, { 
            fileId, 
            fileName, 
            size: buffer.length 
          });
          return buffer;
        }
      }
    } catch (error) {
      logger.warn(`Alternative source ${index + 1} failed`, { 
        sourceUrl: sourceUrl.substring(0, 100) + '...', 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { apiKey, assistantName } = await checkAssistantPrerequisites();
  
  if (!apiKey || !assistantName) {
    logger.error('Missing required environment variables for file download API');
    return NextResponse.json({
      status: "error",
      message: "PINECONE_API_KEY and PINECONE_ASSISTANT_NAME are required."
    }, { status: 400 });
  }

  const baseUrl = process.env.PINECONE_ASSISTANT_URL;
  if (!baseUrl) {
    logger.error('Missing PINECONE_ASSISTANT_URL environment variable');
    return NextResponse.json({
      status: "error",
      message: "PINECONE_ASSISTANT_URL environment variable is required."
    }, { status: 500 });
  }

  const fileId = params.id;
  
  if (!fileId) {
    return NextResponse.json({
      status: "error",
      message: "File ID is required."
    }, { status: 400 });
  }

  // Initialize fileName in the main scope
  let fileName = 'document.pdf';

  try {
    // First, try to get file info to get the file name and signed URL
    let fileInfo: any = null;
    
    try {
      const fileInfoResponse = await apiClient.request<any>(
        `${baseUrl}/assistant/files/${assistantName}/${fileId}`,
        {
          method: 'GET',
          headers: {
            'Api-Key': apiKey,
          },
          timeout: 8000,
          retries: 1,
          useCache: true,
          cacheTTL: 5 * 60 * 1000, // Cache file info for 5 minutes
        }
      );

      fileInfo = fileInfoResponse.data;
      fileName = fileInfo?.name || 'document.pdf';
    } catch (error) {
      logger.warn('Failed to get file info, proceeding with default filename', { 
        fileId, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    // Check local cache first
    const cachedFile = await getFromLocalCache(fileId, fileName);
    if (cachedFile) {
      const contentType = fileName.toLowerCase().endsWith('.pdf') 
        ? 'application/pdf' 
        : 'application/octet-stream';

      return new NextResponse(cachedFile, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
          'X-File-Source': 'Local-Cache',
          'X-Cache-Hit': 'true'
        },
      });
    }

    // Try to get file from Pinecone signed URL first
    if (fileInfo?.signed_url) {
      try {
        logger.info('Attempting download from Pinecone signed URL', { fileId, fileName });
        
        // Use manual timeout for fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        let response;
        try {
          response = await fetch(fileInfo.signed_url, {
            method: 'GET',
            headers: {
              'Accept': 'application/pdf,application/octet-stream,*/*'
            },
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          if (buffer.length > 0) {
            // Save to cache for future use
            await saveToLocalCache(fileId, fileName, buffer);
            
            const contentType = fileName.toLowerCase().endsWith('.pdf') 
              ? 'application/pdf' 
              : 'application/octet-stream';

            logger.info('File downloaded successfully from Pinecone signed URL', { 
              fileId, 
              fileName, 
              size: buffer.length 
            });

            return new NextResponse(buffer, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${fileName}"`,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'public, max-age=3600',
                'X-File-Source': 'Pinecone-SignedURL'
              },
            });
          }
        }
      } catch (error) {
        logger.warn('Signed URL download failed, trying alternatives', { 
          fileId, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    // Try alternative download sources
    logger.info('Attempting download from alternative sources', { fileId, fileName });
    const downloadedBuffer = await downloadFromAlternativeSources(fileId, fileName);
    
    if (downloadedBuffer && downloadedBuffer.length > 0) {
      // Save to cache for future use
      await saveToLocalCache(fileId, fileName, downloadedBuffer);
      
      const contentType = fileName.toLowerCase().endsWith('.pdf') 
        ? 'application/pdf' 
        : 'application/octet-stream';

      return new NextResponse(downloadedBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'public, max-age=3600',
          'X-File-Source': 'Alternative-Source'
        },
      });
    }

    // If all download attempts fail, return error
    logger.error('All download attempts failed', { fileId, fileName });
    return NextResponse.json({
      status: "error",
      message: "File not found or no download URL available. All download sources have been exhausted.",
      troubleshooting: {
        steps: [
          "Check if the file exists in your Pinecone assistant",
          "Verify your Pinecone API credentials",
          "Try refreshing the page to get a new signed URL",
          "Contact support if the issue persists"
        ]
      }
    }, { status: 404 });

  } catch (error) {
    logger.error('Error in download endpoint', { 
      error: error instanceof Error ? error.message : String(error),
      fileId,
      fileName 
    });
    
    return NextResponse.json({
      status: "error",
      message: `Failed to download file: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
} 