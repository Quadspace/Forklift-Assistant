'use server'

import { createStreamableValue } from 'ai/rsc'
import { EventSource } from 'extended-eventsource';
import { logger } from './utils/logger';
import { cache, Cache } from './utils/cache';

type Message = {
  role: string;
  content: string;
}

export async function chat(messages: Message[]) {
  const endTimer = logger.time('chat_total_duration');

  // Create an initial stream, which we'll populate with events from the Pinecone Assistants API
  const stream = createStreamableValue()

  // Check cache for similar queries (for common maintenance questions)
  const cacheKey = Cache.generateKey('chat', { 
    lastMessage: messages[messages.length - 1]?.content?.substring(0, 100) || '',
    messageCount: messages.length 
  });
  
  const cachedResponse = cache.get<string>(cacheKey);
  if (cachedResponse) {
    logger.info('Returning cached response for similar query');
    stream.update(JSON.stringify({
      choices: [{
        delta: { content: cachedResponse },
        finish_reason: 'stop'
      }]
    }));
    stream.done();
    endTimer();
    return { object: stream.value };
  }

  // Construct the full URL to the Pinecone Assistant API for the specific assistant 
  const url = `${process.env.PINECONE_ASSISTANT_URL}/assistant/chat/${process.env.PINECONE_ASSISTANT_NAME}/chat/completions`
  logger.debug('Connecting to Pinecone Assistants API', { url });

  // Add a flag to track if stream is already done
  let streamClosed = false;
  let accumulatedContent = '';
  
  // Reduced timeout for better UX - 30 seconds maximum
  const forceCloseTimeout = setTimeout(() => {
    logger.warn('Force closing stream after maximum timeout');
    if (!streamClosed) {
      try {
        stream.done();
        streamClosed = true;
      } catch (e) {
        logger.error('Error force closing stream', e);
      }
    }
  }, 30000); // Reduced from 45 to 30 seconds
  
  // Reduced activity timeout - if no message for 12 seconds, close the stream
  let activityTimeout: NodeJS.Timeout | null = null;
  
  const resetActivityTimeout = () => {
    if (activityTimeout) clearTimeout(activityTimeout);
    
    activityTimeout = setTimeout(() => {
      logger.warn('No activity for 12 seconds, closing stream');
      if (!streamClosed) {
        try {
          // Cache partial response if we have content
          if (accumulatedContent.length > 50) {
            cache.set(cacheKey, accumulatedContent, 10 * 60 * 1000); // 10 minutes
          }
          stream.done();
          streamClosed = true;
        } catch (e) {
          logger.error('Error closing stream on activity timeout', e);
        }
      }
    }, 12000); // Reduced from 20 to 12 seconds
  };
  
  resetActivityTimeout();

  const eventSource = new EventSource(url, {
    method: 'POST',
    body: JSON.stringify({
      stream: true,
      messages,
    }),
    headers: {
      Authorization: `Bearer ${process.env.PINECONE_API_KEY}`,
      'X-Project-Id': process.env.PINECONE_ASSISTANT_ID!,
    },
    disableRetry: true,
  });

  // When we receive a new message from the Pinecone Assistant API, we update the stream
  eventSource.onmessage = (event: MessageEvent) => {
    // Only log raw data in debug mode, not in production
    logger.debug('Received event data chunk');
    
    // Reset activity timeout on each message
    resetActivityTimeout();
    
    try {
      const message = JSON.parse(event.data);
      
      // Check for empty choices array first, as it might signify a specific end condition
      if (message && Array.isArray(message.choices) && message.choices.length === 0) {
        logger.info('Stream finished: Received empty choices array');
        eventSource.close();
        if (!streamClosed) {
          // Cache complete response
          if (accumulatedContent.length > 50) {
            cache.set(cacheKey, accumulatedContent, 15 * 60 * 1000); // 15 minutes for complete responses
          }
          stream.done();
          streamClosed = true;
          clearTimeout(forceCloseTimeout);
          if (activityTimeout) clearTimeout(activityTimeout);
        }
      } else if (message?.choices[0]?.delta?.content) {
        // Accumulate content for caching
        accumulatedContent += message.choices[0].delta.content;
        stream.update(event.data);
      } else if (message?.choices[0]?.finish_reason) {
        logger.info('Stream finished by assistant', { finish_reason: message.choices[0].finish_reason });
        eventSource.close();
        if (!streamClosed) {
          // Cache complete response
          if (accumulatedContent.length > 50) {
            cache.set(cacheKey, accumulatedContent, 15 * 60 * 1000);
          }
          stream.done();
          streamClosed = true;
          clearTimeout(forceCloseTimeout);
          if (activityTimeout) clearTimeout(activityTimeout);
        }
      } else {
        // Handle unexpected message structure
        logger.debug('Received message with unexpected structure', { hasChoices: !!message?.choices });
        if (message && typeof message === 'object' && Object.keys(message).length === 0) {
          logger.info('Stream possibly finished: Received empty object');
          eventSource.close();
          if (!streamClosed) {
            stream.done();
            streamClosed = true;
            clearTimeout(forceCloseTimeout);
            if (activityTimeout) clearTimeout(activityTimeout);
          }
        }
      }
    } catch (e) {
      logger.error('Error parsing event data', { error: e instanceof Error ? e.message : String(e) });
      // Close stream on parse errors
      if (!streamClosed) {
        try {
          stream.error({ message: 'Error parsing stream data.' });
          streamClosed = true;
          clearTimeout(forceCloseTimeout);
          if (activityTimeout) clearTimeout(activityTimeout);
        } catch (closeError) {
          logger.error('Error closing stream after parse error', closeError);
        }
      }
      try {
        eventSource.close();
      } catch (esCloseError) {
        logger.error('Error closing EventSource after parse error', esCloseError);
      }
    }
  };

  eventSource.onerror = (error: any) => {
    logger.error('EventSource error', { 
      status: error?.status,
      message: error?.message,
      type: error?.type 
    });

    try {
      eventSource.close();
    } catch (e) {
      logger.warn('Error closing EventSource', e);
    }

    // Only report error if stream hasn't been closed already
    if (!streamClosed) {
      try {
        stream.error({ message: 'A connection error occurred with the assistant service.' });
        streamClosed = true;
        clearTimeout(forceCloseTimeout);
        if (activityTimeout) clearTimeout(activityTimeout);
      } catch (e) {
        logger.error('Error closing stream after EventSource error', e);
      }
    }
  };

  endTimer();
  return { object: stream.value }
}