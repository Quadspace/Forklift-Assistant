'use server'

import { createStreamableValue } from 'ai/rsc'
import { EventSource } from 'extended-eventsource';

type Message = {
  role: string;
  content: string;
}

export async function chat(messages: Message[]) {
  try {
    // Create an initial stream
    const stream = createStreamableValue();

    // Construct the full URL to the Pinecone Assistant API
    const url = `${process.env.PINECONE_ASSISTANT_URL}/assistant/chat/${process.env.PINECONE_ASSISTANT_NAME}/chat/completions`;

    // Create EventSource connection
    const eventSource = new EventSource(url, {
      method: 'POST',
      body: JSON.stringify({
        stream: true,
        messages,
        include_highlights: true,
        model: 'gpt-4o'
      }),
      headers: {
        Authorization: `Bearer ${process.env.PINECONE_API_KEY}`,
        'X-Project-Id': process.env.PINECONE_ASSISTANT_ID!,
        'X-Pinecone-API-Version': '2025-04',
        'User-Agent': 'Forklift-Assistant/1.0',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
      disableRetry: true,
      withCredentials: false,
    });

    // Handle incoming messages
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        // Handle empty data
        if (!event.data || event.data.trim() === '') {
          return;
        }

        const data = JSON.parse(event.data);
        
        // Handle empty choices array (stream completion)
        if (data && Array.isArray(data.choices) && data.choices.length === 0) {
          stream.done();
          eventSource.close();
          return;
        }
        
        // Handle finish reason
        if (data?.choices[0]?.finish_reason) {
          stream.done();
          eventSource.close();
          return;
        }
        
        // Handle different message types from Pinecone streaming
        if (data.type === 'message_start' || data.type === 'content_block_start') {
          // Initialize message - just pass through
          stream.update(event.data);
        } else if (data.type === 'content_block_delta' || data?.choices[0]?.delta?.content) {
          // Content chunk - pass through
          stream.update(event.data);
        } else if (data.type === 'citations' || data.citations) {
          // Citation data - pass through for frontend processing
          stream.update(event.data);
        } else if (data.type === 'message_end') {
          // End of message
          stream.done();
          eventSource.close();
          return;
        } else {
          // Default: pass through any other data
          stream.update(event.data);
        }
        
      } catch (error) {
        console.error('Error parsing event data:', error);
      }
    };

    // Handle EventSource errors
    eventSource.onerror = (error: any) => {
      console.error('EventSource error:', error);
      stream.error({ message: 'Connection error occurred - please try again' });
      eventSource.close();
    };

    return { object: stream.value };

  } catch (error) {
    console.error('Error in chat function:', error);
    
    // Create error response
    const stream = createStreamableValue();
    stream.error({ message: 'Service temporarily unavailable - please try again' });
    return { object: stream.value };
  }
}