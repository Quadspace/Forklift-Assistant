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
      model: 'claude-3.5-sonnet'
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
    const message = JSON.parse(event.data)
    if (message?.choices[0]?.finish_reason) {
      eventSource.close();
      stream.done();
    } else {
      stream.update(event.data)
    }
  };

  eventSource.onerror = (error: any) => {
    console.error('EventSource error object:', error);
    if (error && error.status) {
      console.error('EventSource error status:', error.status);
    }
    if (error && error.message) {
      console.error('EventSource error message:', error.message);
    }
    try {
      eventSource.close();
    } catch (e) {
      console.warn('Error closing EventSource (might be already closed):', e);
    }
    stream.error({ message: 'A connection error occurred with the assistant service. Check server logs for details.' });
  };

  return { object: stream.value }
}