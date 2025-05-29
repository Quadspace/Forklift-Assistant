import { NextRequest, NextResponse } from 'next/server';
import { checkAssistantPrerequisites } from '../../utils/assistantUtils';
import { logger } from '../../utils/logger';
import { apiClient } from '../../utils/apiClient';
import { Cache } from '../../utils/cache';

export async function POST(request: NextRequest) {
  try {
    const { apiKey, assistantName } = await checkAssistantPrerequisites();
    
    if (!apiKey || !assistantName) {
      logger.error('Missing required environment variables for document chunks API');
      return NextResponse.json({
        status: "error",
        message: "PINECONE_API_KEY and PINECONE_ASSISTANT_NAME are required.",
        chunks: []
      }, { status: 400 });
    }

    // Check for required environment variables
    const baseUrl = process.env.PINECONE_ASSISTANT_URL;
    if (!baseUrl) {
      logger.error('Missing PINECONE_ASSISTANT_URL environment variable');
      return NextResponse.json({
        status: "error",
        message: "PINECONE_ASSISTANT_URL environment variable is required.",
        chunks: []
      }, { status: 500 });
    }

    const body = await request.json();
    const { fileName, startPage, endPage, searchQuery } = body;

    if (!fileName) {
      return NextResponse.json({
        status: "error",
        message: "fileName is required",
        chunks: []
      }, { status: 400 });
    }

    // Construct query to find relevant chunks for the specific document and pages
    let query = `filename:${fileName}`;
    
    if (startPage) {
      if (endPage && endPage !== startPage) {
        query += ` page:${startPage}-${endPage}`;
      } else {
        query += ` page:${startPage}`;
      }
    }

    if (searchQuery) {
      query += ` ${searchQuery}`;
    }

    logger.debug('Searching Pinecone for document chunks', { query, fileName });

    // Query Pinecone assistant for relevant chunks with caching
    const response = await apiClient.request<any>(
      `${baseUrl}/assistant/chat/${assistantName}/query`,
      {
        method: 'POST',
        headers: {
          'Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          top_k: 10, // Get top 10 most relevant chunks
          include_metadata: true,
          include_values: false
        }),
        timeout: 12000, // 12 second timeout for chunk queries
        retries: 2,
        useCache: true,
        cacheTTL: 10 * 60 * 1000, // Cache for 10 minutes
      }
    );

    const data = response.data;
    
    // Process and format the chunks
    const chunks = data.matches?.map((match: any) => ({
      id: match.id,
      score: match.score,
      text: match.metadata?.text || '',
      page: match.metadata?.page || null,
      fileName: match.metadata?.filename || fileName,
      metadata: match.metadata || {}
    })) || [];

    // Sort chunks by page number if available
    chunks.sort((a: any, b: any) => {
      if (a.page && b.page) {
        return a.page - b.page;
      }
      return b.score - a.score; // Fallback to score sorting
    });

    logger.info(`Document chunks retrieved successfully`, { 
      count: chunks.length, 
      fileName, 
      pages: `${startPage}-${endPage || startPage}`,
      cached: response.cached 
    });

    return NextResponse.json({
      status: "success",
      message: `Found ${chunks.length} relevant chunks`,
      chunks: chunks,
      query: query
    }, { status: 200 });

  } catch (error) {
    logger.error('Error fetching document chunks', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    
    return NextResponse.json({
      status: "error",
      message: `Failed to fetch document chunks: ${error instanceof Error ? error.message : String(error)}`,
      chunks: []
    }, { status: 500 });
  }
} 