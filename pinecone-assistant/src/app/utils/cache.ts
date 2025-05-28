import { logger } from './logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class Cache {
  private store: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes default

  set<T>(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    };
    this.store.set(key, entry);
    logger.debug(`Cache SET: ${key}`, { ttl: entry.ttl });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      logger.debug(`Cache MISS: ${key}`);
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      logger.debug(`Cache EXPIRED: ${key}`);
      return null;
    }

    logger.debug(`Cache HIT: ${key}`);
    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) {
      logger.debug(`Cache DELETE: ${key}`);
    }
    return deleted;
  }

  clear(): void {
    const size = this.store.size;
    this.store.clear();
    logger.debug(`Cache CLEAR: ${size} entries removed`);
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.store.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Cache CLEANUP: ${cleaned} expired entries removed`);
    }
  }

  // Get cache statistics
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.store.size,
      hitRate: 0 // Could implement hit rate tracking if needed
    };
  }

  // Generate cache key for common patterns
  static generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }
}

// Create singleton instance
export const cache = new Cache();

// Export the class for static method access
export { Cache };

// Auto cleanup every 10 minutes
if (typeof window === 'undefined') { // Server-side only
  setInterval(() => {
    cache.cleanup();
  }, 10 * 60 * 1000);
}

export default cache; 