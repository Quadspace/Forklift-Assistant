import { NextResponse } from 'next/server';
import { checkAssistantPrerequisites } from '../../../../utils/assistantUtils';
import { logger } from '../../../../utils/logger';
import { apiClient } from '../../../../utils/apiClient';

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

  // Check for required environment variables
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

  try {
    // First, get the file info to get the signed URL
    const fileInfoResponse = await apiClient.request<any>(
      `${baseUrl}/assistant/files/${assistantName}/${fileId}`,
      {
        method: 'GET',
        headers: {
          'Api-Key': apiKey,
        },
        timeout: 8000,
        retries: 1,
      }
    );

    const fileInfo = fileInfoResponse.data;
    
    if (!fileInfo || !fileInfo.signed_url) {
      logger.error('File not found or no signed URL available', { fileId, assistantName });
      return NextResponse.json({
        status: "error",
        message: "File not found or no download URL available."
      }, { status: 404 });
    }

    // Redirect to the signed URL
    logger.info(`File download redirect successful`, { 
      fileId, 
      fileName: fileInfo.name,
      assistantName 
    });

    return NextResponse.redirect(fileInfo.signed_url);

  } catch (error) {
    logger.error('Error downloading file', { 
      error: error instanceof Error ? error.message : String(error),
      fileId,
      assistantName 
    });
    
    return NextResponse.json({
      status: "error",
      message: `Failed to download file: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
} 