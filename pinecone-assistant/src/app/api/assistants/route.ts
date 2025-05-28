import { NextResponse } from 'next/server';
import { checkAssistantPrerequisites } from '../../utils/assistantUtils';
import { logger } from '../../utils/logger';
import { apiClient } from '../../utils/apiClient';

export async function GET() {
  const endTimer = logger.time('assistants_api_duration');
  
  const { apiKey, assistantName } = await checkAssistantPrerequisites();
  
  if (!apiKey || !assistantName) {
    logger.error('Missing required environment variables for assistants API');
    return NextResponse.json({
      status: "error",
      message: "PINECONE_API_KEY and PINECONE_ASSISTANT_NAME are required.",
      exists: false
    }, { status: 400 });
  }

  try {
    const response = await apiClient.request<any>(
      'https://api.pinecone.io/assistant/assistants',
      {
        method: 'GET',
        headers: {
          'Api-Key': apiKey,
        },
        timeout: 8000,
        retries: 1,
        useCache: true,
        cacheTTL: 15 * 60 * 1000, // Cache for 15 minutes - assistant list doesn't change often
      }
    );

    const assistants = response.data;
    const assistantExists = assistants.assistants.some((assistant: any) => assistant.name === assistantName);

    logger.info(`Assistant check completed`, { 
      assistantName, 
      exists: assistantExists,
      cached: response.cached 
    });

    endTimer();
    return NextResponse.json({
      status: "success",
      message: `Assistant '${assistantName}' check completed.`,
      exists: assistantExists,
      assistant_name: assistantName
    }, { status: 200 });

  } catch (error) {
    logger.error('Error checking assistant', { 
      error: error instanceof Error ? error.message : String(error),
      assistantName 
    });
    
    endTimer();
    return NextResponse.json({
      status: "error",
      message: `Failed to check assistant: ${error instanceof Error ? error.message : String(error)}`,
      exists: false
    }, { status: 500 });
  }
}