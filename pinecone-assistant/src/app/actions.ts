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
    let streamClosed = false;

    // Construct the full URL to the Pinecone Assistant API
    const url = `${process.env.PINECONE_ASSISTANT_HOST}/assistant/chat/${process.env.PINECONE_ASSISTANT_NAME}/chat/completions`;

    console.log('🚀 Starting chat with URL:', url);

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
        'Api-Key': process.env.PINECONE_API_KEY!,
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

    const closeStream = () => {
      if (!streamClosed) {
        streamClosed = true;
        eventSource.close();
        stream.done();
      }
    };

    // Handle incoming messages
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        // Handle empty data
        if (!event.data || event.data.trim() === '') {
          return;
        }

        console.log('📡 Raw event data:', event.data);
        const data = JSON.parse(event.data);
        console.log('📊 Parsed data:', data);
        
        // Handle different message types from Pinecone streaming
        switch (data.type) {
          case 'message_start':
            console.log('🎬 Message start');
            stream.update(JSON.stringify({ type: 'start' }));
            break;
            
          case 'content_chunk':
            console.log('📝 Content chunk:', data.delta?.content);
            if (data.delta?.content) {
              stream.update(JSON.stringify({ type: 'content', content: data.delta.content }));
            }
            break;
            
          case 'citation':
            console.log('📋 Citation received:', data.citation);
            stream.update(JSON.stringify({ type: 'citation', citation: data.citation }));
            break;
            
          case 'message_end':
            console.log('🏁 Message end, finish reason:', data.finish_reason);
            if (data.finish_reason === 'stop') {
              stream.update(JSON.stringify({ type: 'end' }));
              closeStream();
            }
            break;
            
          default:
            console.log('🔄 Default handler for:', data);
            // Handle legacy format or other message types
            if (data && Array.isArray(data.choices)) {
              if (data.choices.length === 0) {
                console.log('🔚 Empty choices array - ending stream');
                closeStream();
                return;
              }
              
              // Handle content from choices format
              if (data.choices[0]?.delta?.content) {
                const content = data.choices[0].delta.content;
                console.log('📝 Legacy content:', content);
                stream.update(JSON.stringify({ type: 'content', content }));
              }
              
              if (data.choices[0]?.finish_reason) {
                console.log('🏁 Legacy finish reason:', data.choices[0].finish_reason);
                closeStream();
                return;
              }
            } else {
              // Pass through other data formats
              stream.update(event.data);
            }
        }
        
      } catch (error) {
        console.error('❌ Error parsing event data:', error);
      }
    };

    // Handle EventSource errors
    eventSource.onerror = (error: any) => {
      console.error('❌ EventSource error:', error);
      if (!streamClosed) {
        stream.error({ message: 'Connection error occurred - please try again' });
        closeStream();
      }
    };

    return { object: stream.value };

  } catch (error) {
    console.error('❌ Error in chat function:', error);
    
    // Create error response
    const stream = createStreamableValue();
    stream.error({ message: 'Service temporarily unavailable - please try again' });
    return { object: stream.value };
  }
}