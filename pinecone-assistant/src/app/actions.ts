'use server'

import { createStreamableValue } from 'ai/rsc'
import { EventSource } from 'extended-eventsource';
import { logger } from './utils/logger';
import { cache, Cache } from './utils/cache';
import { connectionHealth, withConnectionHealth } from './utils/connectionHealth';

type Message = {
  role: string;
  content: string;
}

// Stream state management
enum StreamState {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  CLOSING = 'closing',
  CLOSED = 'closed',
  ERROR = 'error'
}

class StreamManager {
  private state: StreamState = StreamState.INITIALIZING;
  private stream: any;
  private eventSource: EventSource | null = null;
  private timeouts: NodeJS.Timeout[] = [];
  private accumulatedContent = '';
  private cacheKey: string;
  private connectionStartTime: number = 0;

  constructor(stream: any, cacheKey: string) {
    this.stream = stream;
    this.cacheKey = cacheKey;
    this.state = StreamState.ACTIVE;
    this.connectionStartTime = Date.now();
  }

  // Safe stream update with state checking
  safeUpdate(data: string): boolean {
    if (this.state !== StreamState.ACTIVE) {
      logger.debug('Attempted to update stream in invalid state', { state: this.state });
      return false;
    }

    try {
      this.stream.update(data);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error updating stream', { 
        error: errorMsg,
        state: this.state 
      });
      
      // Check for specific "stream closed" error
      if (errorMsg.includes('stream is already closed') || errorMsg.includes('Value stream is already closed')) {
        logger.warn('Detected closed stream error - transitioning to closed state');
        this.setState(StreamState.CLOSED);
        return false;
      }
      
      this.setState(StreamState.ERROR);
      return false;
    }
  }

  // Safe stream completion with state checking
  safeComplete(): boolean {
    if (this.state === StreamState.CLOSED || this.state === StreamState.CLOSING) {
      logger.debug('Stream already closed or closing', { state: this.state });
      return false;
    }

    this.setState(StreamState.CLOSING);
    
    try {
      // Cache complete response if we have content
      if (this.accumulatedContent.length > 50) {
        cache.set(this.cacheKey, this.accumulatedContent, 15 * 60 * 1000);
      }
      
      this.stream.done();
      this.setState(StreamState.CLOSED);
      
      // Record successful connection
      const connectionTime = Date.now() - this.connectionStartTime;
      connectionHealth.recordConnectionSuccess(connectionTime);
      
      this.cleanup();
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error completing stream', { 
        error: errorMsg,
        state: this.state 
      });
      
      // Don't record as connection failure if stream was already closed
      if (!errorMsg.includes('stream is already closed')) {
        connectionHealth.recordConnectionFailure(`Stream completion error: ${errorMsg}`);
      }
      
      this.setState(StreamState.ERROR);
      this.cleanup();
      return false;
    }
  }

  // Safe stream error with state checking
  safeError(errorMessage: string): boolean {
    if (this.state === StreamState.CLOSED) {
      logger.debug('Attempted to error already closed stream', { state: this.state });
      return false;
    }

    this.setState(StreamState.ERROR);
    
    try {
      this.stream.error({ message: errorMessage });
      
      // Record connection failure
      connectionHealth.recordConnectionFailure(errorMessage);
      
      this.cleanup();
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error setting stream error', { 
        error: errorMsg,
        originalError: errorMessage 
      });
      this.cleanup();
      return false;
    }
  }

  // Add content to accumulator
  addContent(content: string): void {
    this.accumulatedContent += content;
  }

  // Set EventSource reference for cleanup
  setEventSource(eventSource: EventSource): void {
    this.eventSource = eventSource;
  }

  // Add timeout for cleanup
  addTimeout(timeout: NodeJS.Timeout): void {
    this.timeouts.push(timeout);
  }

  // Set stream state
  private setState(newState: StreamState): void {
    logger.debug('Stream state change', { from: this.state, to: newState });
    this.state = newState;
  }

  // Get current state
  getState(): StreamState {
    return this.state;
  }

  // Check if stream is active
  isActive(): boolean {
    return this.state === StreamState.ACTIVE;
  }

  // Check if stream is closed or closing
  isClosed(): boolean {
    return this.state === StreamState.CLOSED || this.state === StreamState.CLOSING;
  }

  // Get stream value for return
  getStreamValue(): any {
    return this.stream.value;
  }

  // Cleanup all resources
  private cleanup(): void {
    // Clear all timeouts
    this.timeouts.forEach(timeout => {
      try {
        clearTimeout(timeout);
      } catch (e) {
        logger.debug('Error clearing timeout', e);
      }
    });
    this.timeouts = [];

    // Close EventSource
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch (e) {
        logger.debug('Error closing EventSource', e);
      }
      this.eventSource = null;
    }
  }

  // Force cleanup (for external calls)
  forceCleanup(): void {
    if (!this.isClosed()) {
      this.setState(StreamState.CLOSING);
      this.cleanup();
      this.setState(StreamState.CLOSED);
    }
  }
}

export async function chat(messages: Message[]) {
  const endTimer = logger.time('chat_total_duration');
  let streamManager: StreamManager | null = null;

  try {
    // Check connection health before proceeding
    if (!connectionHealth.shouldAllowConnection()) {
      const healthStatus = connectionHealth.getHealthStatus();
      logger.error('Connection blocked by circuit breaker', healthStatus);
      
      const stream = createStreamableValue();
      stream.error({ 
        message: 'Service temporarily unavailable due to connection issues. Please try again in a few minutes.' 
      });
      return { object: stream.value };
    }

    // Create an initial stream
    const stream = createStreamableValue();

    // Check cache for similar queries
    const cacheKey = Cache.generateKey('chat', { 
      lastMessage: messages[messages.length - 1]?.content?.substring(0, 100) || '',
      messageCount: messages.length 
    });
    
    const cachedResponse = cache.get<string>(cacheKey);
    if (cachedResponse) {
      logger.info('Returning cached response for similar query');
      
      try {
        stream.update(JSON.stringify({
          choices: [{
            delta: { content: cachedResponse },
            finish_reason: 'stop'
          }]
        }));
        stream.done();
      } catch (error) {
        logger.error('Error returning cached response', error);
        stream.error({ message: 'Error retrieving cached response' });
      }
      
      endTimer();
      return { object: stream.value };
    }

    // Initialize stream manager
    streamManager = new StreamManager(stream, cacheKey);

    // Construct the full URL to the Pinecone Assistant API
    const url = `${process.env.PINECONE_ASSISTANT_URL}/assistant/chat/${process.env.PINECONE_ASSISTANT_NAME}/chat/completions`;
    logger.debug('Connecting to Pinecone Assistants API', { url });

    // Use connection health wrapper for EventSource creation
    const eventSource = await withConnectionHealth(async () => {
      return new Promise<EventSource>((resolve, reject) => {
        const es = new EventSource(url, {
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

        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          es.close();
          reject(new Error('EventSource connection timeout'));
        }, 15000); // 15 seconds for connection

        es.onopen = () => {
          clearTimeout(connectionTimeout);
          logger.debug('EventSource connection opened successfully');
          resolve(es);
        };

        es.onerror = (error: any) => {
          clearTimeout(connectionTimeout);
          es.close();
          reject(new Error(`EventSource connection failed: ${error?.message || 'Unknown error'}`));
        };
      });
    }, 20000); // 20 second total timeout

    streamManager.setEventSource(eventSource);

    // Set up activity timeout
    let activityTimeout: NodeJS.Timeout | null = null;
    
    const resetActivityTimeout = () => {
      if (activityTimeout) {
        clearTimeout(activityTimeout);
      }
      
      activityTimeout = setTimeout(() => {
        logger.warn('Activity timeout reached');
        if (streamManager && streamManager.isActive()) {
          streamManager.safeComplete();
        }
      }, 25000); // 25 seconds of inactivity

      if (streamManager) {
        streamManager.addTimeout(activityTimeout);
      }
    };

    resetActivityTimeout();

    // Handle incoming messages
    eventSource.onmessage = (event: MessageEvent) => {
      if (!streamManager || !streamManager.isActive()) {
        logger.debug('Received message for inactive stream, ignoring');
        return;
      }

      logger.debug('Received event data chunk');
      resetActivityTimeout();
      
      try {
        const message = JSON.parse(event.data);
        
        // Handle empty choices array (stream completion)
        if (message && Array.isArray(message.choices) && message.choices.length === 0) {
          logger.info('Stream finished: Received empty choices array');
          streamManager.safeComplete();
          return;
        }
        
        // Handle content delta
        if (message?.choices[0]?.delta?.content) {
          const content = message.choices[0].delta.content;
          streamManager.addContent(content);
          
          if (!streamManager.safeUpdate(event.data)) {
            logger.warn('Failed to update stream with content - stream may be closed');
            return;
          }
        }
        
        // Handle finish reason
        else if (message?.choices[0]?.finish_reason) {
          logger.info('Stream finished by assistant', { 
            finish_reason: message.choices[0].finish_reason 
          });
          streamManager.safeComplete();
          return;
        }
        
        // Handle unexpected message structure
        else {
          logger.debug('Received message with unexpected structure', { 
            hasChoices: !!message?.choices,
            messageKeys: Object.keys(message || {})
          });
          
          // Check for empty object (possible completion signal)
          if (message && typeof message === 'object' && Object.keys(message).length === 0) {
            logger.info('Stream possibly finished: Received empty object');
            streamManager.safeComplete();
            return;
          }
        }
        
      } catch (parseError) {
        logger.error('Error parsing event data', { 
          error: parseError instanceof Error ? parseError.message : String(parseError),
          eventData: event.data?.substring(0, 200) // Log first 200 chars for debugging
        });
        
        if (streamManager && streamManager.isActive()) {
          streamManager.safeError('Error processing response data');
        }
      }
    };

    // Handle EventSource errors
    eventSource.onerror = (error: any) => {
      logger.error('EventSource error during streaming', { 
        status: error?.status,
        message: error?.message,
        type: error?.type,
        readyState: eventSource?.readyState
      });

      if (streamManager && streamManager.isActive()) {
        streamManager.safeError('Connection error occurred - please try again');
      }
    };

    endTimer();
    return { object: streamManager.getStreamValue() };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Unexpected error in chat function', { error: errorMsg });
    
    // Record connection failure if it's a connection-related error
    if (errorMsg.includes('timeout') || errorMsg.includes('connection') || errorMsg.includes('network')) {
      connectionHealth.recordConnectionFailure(errorMsg);
    }
    
    if (streamManager) {
      streamManager.safeError('An unexpected error occurred - please try again');
    } else {
      // If streamManager wasn't created, create a basic error response
      const stream = createStreamableValue();
      stream.error({ message: 'Service temporarily unavailable - please try again' });
      endTimer();
      return { object: stream.value };
    }
    
    endTimer();
    return { object: streamManager.getStreamValue() };
  }
}