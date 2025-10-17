/**
 * Enhanced batch query implementation with intelligent execution strategy
 *
 * This implementation combines the benefits of both approaches:
 * - Fast parallel execution for typical datasets
 * - Safe sequential execution for very large datasets
 * - Controlled concurrency to prevent pool exhaustion
 */

// SQL Server has a limit of 2100 parameters
const BATCH_SIZE = 2000;

// Default Knex mssql pool max size
const DEFAULT_MAX_POOL_SIZE = 10;

/**
 * Smart batched query execution with automatic strategy selection
 *
 * Strategy:
 * - Small datasets (1 batch): Direct execution, no batching overhead
 * - Medium datasets (2-10 batches): Parallel execution for speed
 * - Large datasets (>10 batches): Chunked parallel execution to respect pool limits
 *
 * @param ids - Array of IDs to process
 * @param queryFn - Function that takes a batch of IDs and returns a promise
 * @param options - Optional configuration
 * @returns Flattened array of all results
 */
export const executeBatchedQuerySmart = async <T, U>(
  ids: T[],
  queryFn: (batch: T[]) => Promise<U[]>,
  options?: {
    batchSize?: number; // Custom batch size (default: 2000)
    maxConcurrent?: number; // Max concurrent batches (default: 10)
    strategy?: 'auto' | 'parallel' | 'sequential'; // Execution strategy
  },
): Promise<U[]> => {
  const {
    batchSize = BATCH_SIZE,
    maxConcurrent = DEFAULT_MAX_POOL_SIZE,
    strategy = 'auto',
  } = options || {};

  // Early return for empty arrays
  if (ids.length === 0) {
    return [];
  }

  // Optimization: Single batch doesn't need batching
  if (ids.length <= batchSize) {
    return queryFn(ids);
  }

  // Split into batches
  const batches: T[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }

  // Determine execution strategy
  let executionStrategy = strategy;
  if (strategy === 'auto') {
    if (batches.length <= maxConcurrent) {
      executionStrategy = 'parallel';
    } else {
      executionStrategy = 'sequential'; // Could also be 'chunked-parallel'
    }
  }

  // Execute based on strategy
  switch (executionStrategy) {
    case 'parallel':
      return executeParallel(batches, queryFn);

    case 'sequential':
      return executeSequential(batches, queryFn);

    default:
      // Chunked parallel: Process in chunks of maxConcurrent batches
      return executeChunkedParallel(batches, queryFn, maxConcurrent);
  }
};

/**
 * Execute all batches in parallel (fastest, but uses more connections)
 */
async function executeParallel<T, U>(
  batches: T[][],
  queryFn: (batch: T[]) => Promise<U[]>,
): Promise<U[]> {
  const batchResults = await Promise.all(batches.map(queryFn));
  return batchResults.flat();
}

/**
 * Execute batches sequentially (slowest, but safest)
 */
async function executeSequential<T, U>(
  batches: T[][],
  queryFn: (batch: T[]) => Promise<U[]>,
): Promise<U[]> {
  const results: U[] = [];
  for (const batch of batches) {
    const batchResults = await queryFn(batch);
    results.push(...batchResults);
  }
  return results;
}

/**
 * Execute batches in parallel chunks (balanced approach)
 * Processes batches in groups of maxConcurrent to respect pool limits
 */
async function executeChunkedParallel<T, U>(
  batches: T[][],
  queryFn: (batch: T[]) => Promise<U[]>,
  maxConcurrent: number,
): Promise<U[]> {
  const results: U[] = [];

  for (let i = 0; i < batches.length; i += maxConcurrent) {
    const chunk = batches.slice(i, i + maxConcurrent);
    const chunkResults = await Promise.all(chunk.map(queryFn));
    results.push(...chunkResults.flat());
  }

  return results;
}

/**
 * Original parallel implementation (for backward compatibility)
 */
export const executeBatchedQueryParallel = async <T, U>(
  ids: T[],
  queryFn: (batch: T[]) => Promise<U[]>,
): Promise<U[]> => {
  return executeBatchedQuerySmart(ids, queryFn, { strategy: 'parallel' });
};

/**
 * Original sequential implementation (for backward compatibility)
 */
export const executeBatchedQuerySequential = async <T, U>(
  ids: T[],
  queryFn: (batch: T[]) => Promise<U[]>,
): Promise<U[]> => {
  return executeBatchedQuerySmart(ids, queryFn, { strategy: 'sequential' });
};

/**
 * Default export: Smart batched query with automatic strategy selection
 */
export const executeBatchedQuery = executeBatchedQuerySmart;
