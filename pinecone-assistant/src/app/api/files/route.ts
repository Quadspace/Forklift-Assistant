import { NextResponse } from 'next/server';
import { checkAssistantPrerequisites } from '../../utils/assistantUtils';
import { logger } from '../../utils/logger';
import { apiClient } from '../../utils/apiClient';

export async function GET() {
  const { apiKey, assistantName } = await checkAssistantPrerequisites();
  
  if (!apiKey || !assistantName) {
    logger.error('Missing required environment variables for files API');
    return NextResponse.json({
      status: "error",
      message: "PINECONE_API_KEY and PINECONE_ASSISTANT_NAME are required.",
      files: []
    }, { status: 400 });
  }

  // Check for required environment variables
  const baseUrl = process.env.PINECONE_ASSISTANT_URL;
  if (!baseUrl) {
    logger.error('Missing PINECONE_ASSISTANT_URL environment variable');
    return NextResponse.json({
      status: "error",
      message: "PINECONE_ASSISTANT_URL environment variable is required.",
      files: []
    }, { status: 500 });
  }

  try {
    const response = await apiClient.request<any>(
      `${baseUrl}/assistant/files/${assistantName}`,
      {
        method: 'GET',
        headers: {
          'Api-Key': apiKey,
        },
        timeout: 8000,
        retries: 1,
        useCache: true,
        cacheTTL: 5 * 60 * 1000,
      }
    );

    const data = response.data;
    
    console.log('🔍 Raw Pinecone API response structure:', {
      hasFiles: !!data.files,
      filesCount: data.files?.length || 0,
      firstFileKeys: data.files?.[0] ? Object.keys(data.files[0]) : [],
      firstFileHasSignedUrl: data.files?.[0]?.signed_url ? 'YES' : 'NO',
      firstFile: data.files?.[0]
    });
    
    if (!data.files || !Array.isArray(data.files)) {
      throw new Error('Unexpected response format: files is not an array');
    }

    const fileData = data.files.map((file: any) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      created_at: file.created_on,
      updated_at: file.updated_on,
      status: file.status,
      metadata: file.metadata,
      signed_url: file.signed_url
    }));

    logger.info(`Files retrieved successfully`, { 
      count: fileData.length, 
      assistantName,
      cached: response.cached 
    });

    return NextResponse.json({
      status: "success",
      message: `Files for assistant '${assistantName}' retrieved successfully.`,
      files: fileData
    }, { status: 200 });

  } catch (error) {
    logger.error('Error listing assistant files', { 
      error: error instanceof Error ? error.message : String(error),
      assistantName 
    });
    
    return NextResponse.json({
      status: "error",
      message: `Failed to list assistant files: ${error instanceof Error ? error.message : String(error)}`,
      files: []
    }, { status: 500 });
  }
}