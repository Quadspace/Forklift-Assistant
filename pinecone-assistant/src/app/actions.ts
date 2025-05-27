'use server'

import { createStreamableValue } from 'ai/rsc'
import { EventSource } from 'extended-eventsource';

type Message = {
  role: string;
  content: string;
}

export async function chat(messages: Message[]) {

  // Create an initial stream, which we'll populate with events from the Pinecone Assistants API
  const stream = createStreamableValue()

  // Construct the full URL to the Pinecone Assistant API for the specific assistant 
  // indicated by the user
  const url = `${process.env.PINECONE_ASSISTANT_URL}/assistant/chat/${process.env.PINECONE_ASSISTANT_NAME}/chat/completions`
  console.log('Connecting to Pinecone Assistants API at URL:', url);

  // Add a flag to track if stream is already done
  let streamClosed = false;
  
  // Force stream to close after a maximum timeout period
  const forceCloseTimeout = setTimeout(() => {
    console.log('Force closing stream after maximum timeout');
    if (!streamClosed) {
      try {
        stream.done();
        streamClosed = true;
      } catch (e) {
        console.warn('Error force closing stream:', e);
      }
    }
  }, 45000); // 45 seconds maximum
  
  // Set activity timeout - if no message for 20 seconds, close the stream
  let activityTimeout: NodeJS.Timeout | null = null;
  
  const resetActivityTimeout = () => {
    if (activityTimeout) clearTimeout(activityTimeout);
    
    activityTimeout = setTimeout(() => {
      console.log('No activity for 20 seconds, closing stream');
      if (!streamClosed) {
        try {
          stream.done();
          streamClosed = true;
        } catch (e) {
          console.warn('Error closing stream on activity timeout:', e);
        }
      }
    }, 20000); // 20 seconds without activity
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

  // When we recieve a new message from the Pinecone Assistant API, we update the stream
  // Unless the Assistant is done, in which case we close the stream
  eventSource.onmessage = (event: MessageEvent) => {
    console.log('Raw event.data:', event.data); // Log all incoming data
    
    // Reset activity timeout on each message
    resetActivityTimeout();
    
    try {
      const message = JSON.parse(event.data);
      // Check for empty choices array first, as it might signify a specific end condition
      if (message && Array.isArray(message.choices) && message.choices.length === 0) {
        console.log('Stream finished: Received empty choices array.');
        eventSource.close();
        if (!streamClosed) {
          stream.done();
          streamClosed = true;
          // Clear timeouts
          clearTimeout(forceCloseTimeout);
          if (activityTimeout) clearTimeout(activityTimeout);
        }
      } else if (message?.choices[0]?.delta?.content) {
        stream.update(event.data);
      } else if (message?.choices[0]?.finish_reason) {
        console.log('Stream finished by assistant with finish_reason:', message.choices[0].finish_reason);
        eventSource.close();
        if (!streamClosed) {
          stream.done();
          streamClosed = true;
          // Clear timeouts
          clearTimeout(forceCloseTimeout);
          if (activityTimeout) clearTimeout(activityTimeout);
        }
      } else {
        // Potentially empty but valid JSON, or unexpected structure not yet handled
        console.warn('Received message with no content, finish_reason, or empty choices:', message);
        // If we're receiving empty messages repeatedly, this could be a sign of completion
        // Add a fallback completion check
        if (message && typeof message === 'object' && Object.keys(message).length === 0) {
          console.log('Stream possibly finished: Received empty object');
          eventSource.close();
          if (!streamClosed) {
            stream.done();
            streamClosed = true;
            // Clear timeouts
            clearTimeout(forceCloseTimeout);
            if (activityTimeout) clearTimeout(activityTimeout);
          }
        }
      }
    } catch (e) {
      console.error('Error parsing event.data:', e);
      console.error('Problematic event.data content was:', event.data);
      // Close stream on parse errors
      if (!streamClosed) {
        try {
          stream.error({ message: 'Error parsing stream data.', details: event.data });
          streamClosed = true;
          // Clear timeouts
          clearTimeout(forceCloseTimeout);
          if (activityTimeout) clearTimeout(activityTimeout);
        } catch (closeError) {
          console.warn('Error closing stream after parse error:', closeError);
        }
      }
      try {
        eventSource.close(); // Also close the event source itself
      } catch (esCloseError) {
        console.warn('Error closing EventSource after parse error:', esCloseError);
      }
    }
  };

  eventSource.onerror = (error: any) => { // Changed type to any to allow property access
    console.error('EventSource error details:', error);
    if (error && typeof error === 'object') {
      for (const key in error) {
        // Avoid logging verbose non-essential properties or functions
        if (typeof error[key] !== 'function' && key !== 'target' && key !== 'currentTarget' && key !== 'srcElement') {
            console.error(`Error object key ${key}:`, error[key]);
        }
      }
    }
    if (error && error.status) { // extended-eventsource might provide status
        console.error('EventSource error status:', error.status);
    }
    if (error && error.message) { // extended-eventsource might provide message
        console.error('EventSource error message:', error.message);
    }

    try {
      eventSource.close();
    } catch (e) {
      console.warn('Error closing EventSource (might be already closed):', e);
    }

    // Only report error if stream hasn't been closed already
    if (!streamClosed) {
      try {
        stream.error({ message: 'A connection error occurred with the assistant service.' });
        streamClosed = true;
        // Clear timeouts
        clearTimeout(forceCloseTimeout);
        if (activityTimeout) clearTimeout(activityTimeout);
      } catch (e) {
        console.warn('Error closing stream (might be already closed):', e);
      }
    }
  };

  return { object: stream.value }
}