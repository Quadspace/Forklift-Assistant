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
    try {
      const message = JSON.parse(event.data);
      if (message?.choices[0]?.finish_reason) {
        console.log('Stream finished by assistant.');
        eventSource.close();
        stream.done();
      } else if (message?.choices[0]?.delta?.content) {
        stream.update(event.data);
      } else {
        // Potentially empty but valid JSON, or unexpected structure
        console.warn('Received message with no content or finish_reason:', message);
      }
    } catch (e) {
      console.error('Error parsing event.data:', e);
      console.error('Problematic event.data content was:', event.data);
      // Decide if/how to signal this specific error to the client if it's not a general connection error
      // For now, we let it fall through to the main onerror or the client handles broken stream
    }
  };

  eventSource.onerror = (error: any) => { // Changed type to any to allow property access
    console.error('EventSource error details:', error);
    // Log more properties if they exist
    if (error && typeof error === 'object') {
      for (const key in error) {
        console.error(`Error object key ${key}:`, error[key]);
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
    stream.error({ message: 'A connection error occurred with the assistant service.' });
  };

  return { object: stream.value }
}