import { logger } from './logger';

export async function checkAssistantPrerequisites() {
  const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
  const PINECONE_ASSISTANT_NAME = process.env.PINECONE_ASSISTANT_NAME;

  logger.debug('Checking assistant prerequisites', { 
    hasApiKey: !!PINECONE_API_KEY, 
    assistantName: PINECONE_ASSISTANT_NAME 
  });

  if (!PINECONE_API_KEY || !PINECONE_ASSISTANT_NAME) {
    logger.error("Missing required environment variables: PINECONE_API_KEY or PINECONE_ASSISTANT_NAME");
    return { apiKey: null, assistantName: null };
  }

  return { apiKey: PINECONE_API_KEY, assistantName: PINECONE_ASSISTANT_NAME };
}