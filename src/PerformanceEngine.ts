// =============================================================================
// SOTA PERFORMANCE ENGINE v1.0 - ENTERPRISE-GRADE CACHING & OPTIMIZATION
// Implements: LRU Cache, Parallel Execution, Circuit Breaker, Batch Validation
// =============================================================================

type CacheEntry<T> = {
  data: T;
  expires: number;
  hits: number;
  createdAt: number;
};

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  successCount: number;
}

// =============================================================================
// LRU CACHE WITH TTL
// =============================================================================

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;

  constructor(maxSize: number = 500, defaultTTLMs: number = 3600000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  set(key: string, data: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expires: Date.now() + (ttlMs ?? this.defaultTTL),
      hits: 0,
      createdAt: Date.now()
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; hitRate: number; entries: number } {
    let totalHits = 0;
    let entries = 0;
    const now = Date.now();

    this.cache.forEach((entry) => {
      if (entry.expires > now) {
        totalHits += entry.hits;
        entries++;
      }
    });

    return {
      size: this.cache.size,
      hitRate: entries > 0 ? totalHits / entries : 0,
      entries
    };
  }

  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expires <= now) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

// =============================================================================
// GLOBAL CACHES - SINGLETON INSTANCES
// =============================================================================

export const semanticKeywordsCache = new LRUCache<string[]>(200, 86400000); // 24hr
export const neuronTermsCache = new LRUCache<any>(100, 3600000); // 1hr
export const youtubeCache = new LRUCache<any>(200, 3600000); // 1hr
export const referenceCache = new LRUCache<any>(300, 86400000); // 24hr
export const validatedUrlCache = new LRUCache<boolean>(1000, 86400000); // 24hr
export const contentCache = new LRUCache<string>(50, 1800000); // 30min
export const serpCache = new LRUCache<any>(200, 3600000); // 1hr

// =============================================================================
// CIRCUIT BREAKER PATTERN
// =============================================================================

const circuitBreakers = new Map<string, CircuitBreakerState>();

const CIRCUIT_CONFIG = {
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  halfOpenSuccessThreshold: 2
};

export function getCircuitState(serviceName: string): CircuitState {
  const breaker = circuitBreakers.get(serviceName);
  if (!breaker) return 'closed';

  if (breaker.state === 'open') {
    if (Date.now() - breaker.lastFailure > CIRCUIT_CONFIG.resetTimeoutMs) {
      breaker.state = 'half-open';
      breaker.successCount = 0;
    }
  }

  return breaker.state;
}

export function recordSuccess(serviceName: string): void {
  const breaker = circuitBreakers.get(serviceName);
  if (!breaker) {
    circuitBreakers.set(serviceName, {
      state: 'closed',
      failures: 0,
      lastFailure: 0,
      successCount: 1
    });
    return;
  }

  if (breaker.state === 'half-open') {
    breaker.successCount++;
    if (breaker.successCount >= CIRCUIT_CONFIG.halfOpenSuccessThreshold) {
      breaker.state = 'closed';
      breaker.failures = 0;
    }
  } else {
    breaker.failures = Math.max(0, breaker.failures - 1);
  }
}

export function recordFailure(serviceName: string): void {
  let breaker = circuitBreakers.get(serviceName);
  if (!breaker) {
    breaker = { state: 'closed', failures: 0, lastFailure: 0, successCount: 0 };
    circuitBreakers.set(serviceName, breaker);
  }

  breaker.failures++;
  breaker.lastFailure = Date.now();

  if (breaker.failures >= CIRCUIT_CONFIG.failureThreshold) {
    breaker.state = 'open';
    console.warn(`[CircuitBreaker] ${serviceName} circuit OPEN after ${breaker.failures} failures`);
  }
}

export async function withCircuitBreaker<T>(
  serviceName: string,
  operation: () => Promise<T>,
  fallback?: T
): Promise<T> {
  const state = getCircuitState(serviceName);

  if (state === 'open') {
    console.warn(`[CircuitBreaker] ${serviceName} circuit is OPEN, using fallback`);
    if (fallback !== undefined) return fallback;
    throw new Error(`Service ${serviceName} is temporarily unavailable`);
  }

  try {
    const result = await operation();
    recordSuccess(serviceName);
    return result;
  } catch (error) {
    recordFailure(serviceName);
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

// =============================================================================
// PARALLEL BATCH EXECUTION
// =============================================================================

export async function parallelBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5,
  earlyExitCount?: number
): Promise<{ results: R[]; succeeded: number; failed: number }> {
  const results: R[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    if (earlyExitCount && succeeded >= earlyExitCount) break;

    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(processor));

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        succeeded++;
      } else {
        failed++;
      }
    }
  }

  return { results, succeeded, failed };
}

// =============================================================================
// URL VALIDATION WITH BATCHING
// =============================================================================

export async function validateUrlBatch(
  urls: string[],
  timeoutMs: number = 3000,
  concurrency: number = 5,
  targetCount: number = 10
): Promise<string[]> {
  const validated: string[] = [];
  const cacheKey = (url: string) => `url:${url}`;

  const uncachedUrls: string[] = [];
  for (const url of urls) {
    const cached = validatedUrlCache.get(cacheKey(url));
    if (cached === true) {
      validated.push(url);
      if (validated.length >= targetCount) return validated;
    } else if (cached !== false) {
      uncachedUrls.push(url);
    }
  }

  for (let i = 0; i < uncachedUrls.length && validated.length < targetCount; i += concurrency) {
    const batch = uncachedUrls.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; ContentOptimizer/2.0)'
            }
          });
          clearTimeout(timeoutId);

          const isValid = response.status === 200;
          validatedUrlCache.set(cacheKey(url), isValid);
          return isValid ? url : null;
        } catch {
          clearTimeout(timeoutId);
          validatedUrlCache.set(cacheKey(url), false);
          return null;
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        validated.push(result.value);
        if (validated.length >= targetCount) break;
      }
    }
  }

  return validated;
}

// =============================================================================
// EXPONENTIAL BACKOFF RETRY
// =============================================================================

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    onRetry
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        const jitter = Math.random() * 0.3 * delay;
        const totalDelay = delay + jitter;

        onRetry?.(attempt + 1, error);
        console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(totalDelay)}ms`);

        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

// =============================================================================
// TIMEOUT WRAPPER
// =============================================================================

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// =============================================================================
// CACHED ASYNC FUNCTION WRAPPER
// =============================================================================

export function cached<T>(
  cache: LRUCache<T>,
  keyFn: (...args: any[]) => string,
  ttlMs?: number
) {
  return function(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const key = keyFn(...args);
      const cached = cache.get(key);

      if (cached !== null) {
        console.log(`[Cache] HIT: ${key.substring(0, 50)}...`);
        return cached;
      }

      console.log(`[Cache] MISS: ${key.substring(0, 50)}...`);
      const result = await originalMethod.apply(this, args);
      cache.set(key, result, ttlMs);
      return result;
    };

    return descriptor;
  };
}

export async function getCached<T>(
  cache: LRUCache<T>,
  key: string,
  fetcher: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const cachedData = cache.get(key);
  if (cachedData !== null) {
    console.log(`[Cache] HIT: ${key.substring(0, 50)}...`);
    return cachedData;
  }

  console.log(`[Cache] MISS: ${key.substring(0, 50)}...`);
  const data = await fetcher();
  cache.set(key, data, ttlMs);
  return data;
}

// =============================================================================
// PARALLEL EXECUTION ORCHESTRATOR
// =============================================================================

type TaskResult<T> = { success: true; data: T } | { success: false; error: Error };

export async function executeParallel<T extends Record<string, () => Promise<any>>>(
  tasks: T,
  timeoutMs: number = 30000
): Promise<{ [K in keyof T]: TaskResult<Awaited<ReturnType<T[K]>>> }> {
  const entries = Object.entries(tasks);
  const results: Record<string, TaskResult<any>> = {};

  const wrappedTasks = entries.map(async ([key, task]) => {
    try {
      const data = await withTimeout(task(), timeoutMs, key);
      results[key] = { success: true, data };
    } catch (error: any) {
      console.error(`[Parallel] Task "${key}" failed:`, error.message);
      results[key] = { success: false, error };
    }
  });

  await Promise.all(wrappedTasks);

  return results as any;
}

// =============================================================================
// PERFORMANCE METRICS
// =============================================================================

interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  metadata?: Record<string, any>;
}

const metricsLog: PerformanceMetrics[] = [];

export function startMetric(operationName: string, metadata?: Record<string, any>): number {
  const index = metricsLog.push({
    operationName,
    startTime: Date.now(),
    success: false,
    metadata
  }) - 1;
  return index;
}

export function endMetric(index: number, success: boolean = true): number {
  const metric = metricsLog[index];
  if (metric) {
    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;
    console.log(`[Perf] ${metric.operationName}: ${metric.duration}ms (${success ? 'success' : 'failed'})`);
    return metric.duration;
  }
  return 0;
}

export function getMetricsSummary(): {
  totalOperations: number;
  successRate: number;
  avgDuration: number;
  slowestOperation: string;
  fastestOperation: string;
} {
  const completed = metricsLog.filter(m => m.duration !== undefined);
  if (completed.length === 0) {
    return {
      totalOperations: 0,
      successRate: 0,
      avgDuration: 0,
      slowestOperation: 'N/A',
      fastestOperation: 'N/A'
    };
  }

  const successful = completed.filter(m => m.success);
  const sorted = [...completed].sort((a, b) => (b.duration || 0) - (a.duration || 0));

  return {
    totalOperations: completed.length,
    successRate: (successful.length / completed.length) * 100,
    avgDuration: completed.reduce((sum, m) => sum + (m.duration || 0), 0) / completed.length,
    slowestOperation: sorted[0]?.operationName || 'N/A',
    fastestOperation: sorted[sorted.length - 1]?.operationName || 'N/A'
  };
}

export function clearMetrics(): void {
  metricsLog.length = 0;
}

// =============================================================================
// CLEAR ALL CACHES
// =============================================================================

export function clearAllCaches(): void {
  semanticKeywordsCache.clear();
  neuronTermsCache.clear();
  youtubeCache.clear();
  referenceCache.clear();
  validatedUrlCache.clear();
  contentCache.clear();
  serpCache.clear();
  circuitBreakers.clear();
  console.log('[PerformanceEngine] All caches cleared');
}

export function getCacheStats(): Record<string, { size: number; hitRate: number; entries: number }> {
  return {
    semanticKeywords: semanticKeywordsCache.getStats(),
    neuronTerms: neuronTermsCache.getStats(),
    youtube: youtubeCache.getStats(),
    references: referenceCache.getStats(),
    validatedUrls: validatedUrlCache.getStats(),
    content: contentCache.getStats(),
    serp: serpCache.getStats()
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  LRUCache,
  semanticKeywordsCache,
  neuronTermsCache,
  youtubeCache,
  referenceCache,
  validatedUrlCache,
  contentCache,
  serpCache,
  withCircuitBreaker,
  parallelBatch,
  validateUrlBatch,
  withRetry,
  withTimeout,
  getCached,
  executeParallel,
  startMetric,
  endMetric,
  getMetricsSummary,
  clearAllCaches,
  getCacheStats
};
