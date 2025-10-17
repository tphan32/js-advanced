/**
 * Performance test comparison between executeBatchedQuery and withBatchQuery
 *
 * Run this test to measure actual performance differences in your environment
 *
 * Usage:
 *   npx tsx performance-test.ts
 *
 *   Or from the veridooh-api directory:
 *   npx tsx src/verification/repo/performance-test.ts
 */

import { getKnex, withBatchQuery } from '@veridooh/shared-modules';

const BATCH_SIZE = 2000;

/**
 * Original executeBatchedQuery implementation (parallel)
 */
const executeBatchedQueryParallel = async <T, U>(
  ids: T[],
  queryFn: (batch: T[]) => Promise<U[]>,
): Promise<U[]> => {
  if (ids.length === 0) {
    return [];
  }

  if (ids.length <= BATCH_SIZE) {
    return queryFn(ids);
  }

  const batches: T[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    batches.push(ids.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(batches.map(queryFn));
  return batchResults.flat();
};

/**
 * Current withBatchQuery implementation (sequential)
 */
const executeBatchedQuerySequential = async <T, U>(
  ids: T[],
  queryFn: (batch: T[]) => Promise<U[]>,
): Promise<U[]> => {
  return withBatchQuery(ids, BATCH_SIZE, queryFn);
};

/**
 * Mock query function that simulates database query
 */
const mockDatabaseQuery = async (
  ids: number[],
): Promise<{ id: number; data: string }[]> => {
  // Simulate realistic query time (50-150ms)
  const queryTime = 50 + Math.random() * 100;
  await new Promise((resolve) => setTimeout(resolve, queryTime));

  return ids.map((id) => ({
    id,
    data: `Data for id ${id}`,
  }));
};

/**
 * Run performance test
 */
async function runPerformanceTest(
  name: string,
  datasetSize: number,
  executeFn: (ids: number[], queryFn: typeof mockDatabaseQuery) => Promise<any[]>,
) {
  const ids = Array.from({ length: datasetSize }, (_, i) => i + 1);
  const batches = Math.ceil(datasetSize / BATCH_SIZE);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test: ${name}`);
  console.log(`Dataset Size: ${datasetSize.toLocaleString()} items`);
  console.log(`Batches: ${batches}`);
  console.log(`${'='.repeat(60)}`);

  const startTime = Date.now();
  const result = await executeFn(ids, mockDatabaseQuery);
  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`✓ Completed in ${duration}ms`);
  console.log(`✓ Results: ${result.length.toLocaleString()} items`);
  console.log(`✓ Avg time per batch: ${(duration / batches).toFixed(2)}ms`);

  return { duration, batches, itemCount: result.length };
}

/**
 * Run comparison tests
 */
async function runComparison() {
  console.log(
    '\n🔬 Performance Comparison: executeBatchedQuery (Parallel) vs withBatchQuery (Sequential)',
  );
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log(`Mock Query Time: 50-150ms (simulated database query)`);

  const testSizes = [
    1000, // 1 batch
    4000, // 2 batches
    10000, // 5 batches
    20000, // 10 batches
  ];

  const results: any[] = [];

  for (const size of testSizes) {
    // Test parallel execution
    const parallelResult = await runPerformanceTest(
      'Parallel (executeBatchedQuery)',
      size,
      executeBatchedQueryParallel,
    );

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test sequential execution
    const sequentialResult = await runPerformanceTest(
      'Sequential (withBatchQuery)',
      size,
      executeBatchedQuerySequential,
    );

    // Calculate speedup
    const speedup = (sequentialResult.duration / parallelResult.duration).toFixed(2);
    const timeSaved = sequentialResult.duration - parallelResult.duration;

    results.push({
      size,
      batches: parallelResult.batches,
      parallelTime: parallelResult.duration,
      sequentialTime: sequentialResult.duration,
      speedup,
      timeSaved,
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Parallel:   ${parallelResult.duration}ms`);
    console.log(`   Sequential: ${sequentialResult.duration}ms`);
    console.log(`   Speedup:    ${speedup}x faster (parallel)`);
    console.log(`   Time Saved: ${timeSaved}ms`);

    // Delay before next test
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Print summary table
  console.log('\n\n' + '='.repeat(90));
  console.log('📊 PERFORMANCE SUMMARY');
  console.log('='.repeat(90));
  console.log(
    'Dataset Size'.padEnd(15) +
      'Batches'.padEnd(10) +
      'Parallel'.padEnd(12) +
      'Sequential'.padEnd(14) +
      'Speedup'.padEnd(12) +
      'Time Saved',
  );
  console.log('-'.repeat(90));

  for (const result of results) {
    console.log(
      `${result.size.toLocaleString()}`.padEnd(15) +
        `${result.batches}`.padEnd(10) +
        `${result.parallelTime}ms`.padEnd(12) +
        `${result.sequentialTime}ms`.padEnd(14) +
        `${result.speedup}x`.padEnd(12) +
        `${result.timeSaved}ms`,
    );
  }

  console.log('='.repeat(90));

  // Calculate average speedup
  const avgSpeedup = (
    results.reduce((sum, r) => sum + parseFloat(r.speedup), 0) / results.length
  ).toFixed(2);

  console.log(`\n⚡ Average Speedup: ${avgSpeedup}x faster with parallel execution`);
  console.log(
    `\n⚠️  Recommendation: ${
      parseFloat(avgSpeedup) > 2
        ? 'Use executeBatchedQuery (parallel) for significant performance gains'
        : 'Performance difference is minimal, either approach is acceptable'
    }`,
  );
}

/**
 * Test with actual database queries (if available)
 */
async function testWithRealQueries() {
  console.log('\n\n🗄️  Testing with Real Database Queries...\n');

  try {
    const knex = getKnex();

    // Test query: Get creative details
    const testQuery = (batch: number[]) =>
      knex
        .select('Id', 'Filename')
        .fromNoLock('Creative')
        .whereIn('Id', batch)
        .limit(batch.length);

    // Get some actual IDs from the database
    const sampleIds = await knex.select('Id').fromNoLock('Creative').limit(5000);
    const ids = sampleIds.map((row: any) => row.Id);

    if (ids.length === 0) {
      console.log('⚠️  No data available for real query test');
      return;
    }

    console.log(`Found ${ids.length} creative IDs for testing\n`);

    // Test parallel
    const parallelResult = await runPerformanceTest(
      'Parallel (Real DB Query)',
      ids.length,
      (testIds, _) => executeBatchedQueryParallel(testIds, testQuery),
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test sequential
    const sequentialResult = await runPerformanceTest(
      'Sequential (Real DB Query)',
      ids.length,
      (testIds, _) => executeBatchedQuerySequential(testIds, testQuery),
    );

    const speedup = (sequentialResult.duration / parallelResult.duration).toFixed(2);
    console.log(`\n📊 Real Database Query Results:`);
    console.log(`   Speedup: ${speedup}x faster with parallel execution`);
  } catch (error) {
    console.error('❌ Error testing with real queries:', error);
    console.log('Skipping real database tests...');
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Run mock tests
    await runComparison();

    // Uncomment to test with real database queries
    // await testWithRealQueries();

    console.log('\n✅ Performance testing complete!\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export {
  executeBatchedQueryParallel,
  executeBatchedQuerySequential,
  runPerformanceTest,
  runComparison,
};
