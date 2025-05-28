import { logger } from './logger';
import { cache, Cache } from './cache';

interface ApiRequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  useCache?: boolean;
  cacheTTL?: number;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  cached?: boolean;
}

class ApiClient {
  private defaultTimeout = 10000; // 10 seconds
  private defaultRetries = 2;
  private defaultRetryDelay = 1000; // 1 second

  async request<T>(
    url: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      timeout = this.defaultTimeout,
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
      useCache = false,
      cacheTTL,
      ...fetchOptions
    } = options;

    // Generate cache key if caching is enabled
    const cacheKey = useCache 
      ? Cache.generateKey('api', { url, method: fetchOptions.method || 'GET', body: fetchOptions.body })
      : null;

    // Check cache first
    if (useCache && cacheKey) {
      const cached = cache.get<T>(cacheKey);
      if (cached) {
        return { data: cached, status: 200, cached: true };
      }
    }

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();
        
        const response = await fetch(url, {
          ...fetchOptions,
          signal: timeoutController.signal,
        });

        clearTimeout(timeoutId);
        
        const duration = Date.now() - startTime;
        logger.metric(`api_request_${response.status}`, duration);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Cache successful responses
        if (useCache && cacheKey && response.status === 200) {
          cache.set(cacheKey, data, cacheTTL);
        }

        logger.debug(`API request successful`, { url, status: response.status, duration });
        
        return { data, status: response.status };

      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof Error && error.name === 'AbortError') {
          logger.error(`API request timeout after ${timeout}ms`, { url });
          throw new Error(`Request timeout after ${timeout}ms`);
        }

        if (attempt < retries) {
          logger.warn(`API request failed, retrying (${attempt + 1}/${retries})`, { 
            url, 
            error: error instanceof Error ? error.message : String(error) 
          });
          await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    clearTimeout(timeoutId);
    logger.error(`API request failed after ${retries + 1} attempts`, { 
      url, 
      error: lastError?.message 
    });
    throw lastError || new Error('Request failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Batch multiple requests with concurrency control
  async batchRequests<T>(
    requests: Array<{ url: string; options?: ApiRequestOptions }>,
    concurrency: number = 3
  ): Promise<Array<ApiResponse<T> | Error>> {
    const results: Array<ApiResponse<T> | Error> = [];
    const executing: Promise<void>[] = [];

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      
      const promise = this.request<T>(request.url, request.options)
        .then(result => {
          results[i] = result;
        })
        .catch(error => {
          results[i] = error;
        });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p === promise), 1);
      }
    }

    await Promise.all(executing);
    return results;
  }
}

export const apiClient = new ApiClient();
export default apiClient; 