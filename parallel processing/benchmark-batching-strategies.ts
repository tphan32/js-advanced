#!/usr/bin/env ts-node

/**
 * Simple benchmark to compare execution strategies
 * This simulates database queries with controlled delays
 */

async function simulateQuery(batchSize: number, delay: number = 100): Promise<any[]> {
  await new Promise(resolve => setTimeout(resolve, delay));
  return Array(batchSize).fill({ data: 'mock result' });
}

// Strategy 1: Sequential (like withBatchQuery)
async function sequentialExecution(
  items: any[],
  batchSize: number
): Promise<{ results: any[], duration: number }> {
  const startTime = performance.now();
  const results: any[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await simulateQuery(batch.length);
    results.push(...batchResults);
  }
  
  const duration = performance.now() - startTime;
  return { results, duration };
}

// Strategy 2: Parallel (like executeBatchedQuery with parallel)
async function parallelExecution(
  items: any[],
  batchSize: number
): Promise<{ results: any[], duration: number }> {
  const startTime = performance.now();
  const batches: any[][] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  const batchResults = await Promise.all(
    batches.map(batch => simulateQuery(batch.length))
  );
  
  const results = batchResults.flat();
  const duration = performance.now() - startTime;
  return { results, duration };
}

// Strategy 3: Chunked Parallel
async function chunkedParallelExecution(
  items: any[],
  batchSize: number,
  maxConcurrent: number = 10
): Promise<{ results: any[], duration: number }> {
  const startTime = performance.now();
  const batches: any[][] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  const results: any[] = [];
  
  for (let i = 0; i < batches.length; i += maxConcurrent) {
    const chunk = batches.slice(i, i + maxConcurrent);
    const chunkResults = await Promise.all(
      chunk.map(batch => simulateQuery(batch.length))
    );
    results.push(...chunkResults.flat());
  }
  
  const duration = performance.now() - startTime;
  return { results, duration };
}

async function runBenchmark() {
  console.log('🧪 Batching Strategy Benchmark\n');
  console.log('Simulating database queries with 100ms delay per batch\n');
  console.log('='.repeat(80));
  
  const testCases = [
    { name: 'Small Dataset', itemCount: 500, batchSize: 1000, expectedBatches: 1 },
    { name: 'Medium Dataset', itemCount: 2500, batchSize: 1000, expectedBatches: 3 },
    { name: 'Large Dataset', itemCount: 5000, batchSize: 1000, expectedBatches: 5 },
    { name: 'Very Large Dataset', itemCount: 10000, batchSize: 1000, expectedBatches: 10 },
    { name: 'Huge Dataset', itemCount: 25000, batchSize: 1000, expectedBatches: 25 },
  ];
  
  for (const testCase of testCases) {
    const items = Array(testCase.itemCount).fill(null).map((_, i) => ({ id: i }));
    
    console.log(`\n${testCase.name}`);
    console.log(`  Items: ${testCase.itemCount.toLocaleString()}`);
    console.log(`  Batches: ${testCase.expectedBatches}`);
    console.log(`  Batch Size: ${testCase.batchSize}`);
    console.log('-'.repeat(80));
    
    // Test Sequential
    const seq = await sequentialExecution(items, testCase.batchSize);
    console.log(`  Sequential:        ${seq.duration.toFixed(2)}ms`);
    
    // Test Parallel
    const par = await parallelExecution(items, testCase.batchSize);
    console.log(`  Parallel:          ${par.duration.toFixed(2)}ms`);
    
    // Test Chunked Parallel
    const chunked = await chunkedParallelExecution(items, testCase.batchSize, 10);
    console.log(`  Chunked Parallel:  ${chunked.duration.toFixed(2)}ms`);
    
    // Calculate speedup
    const speedup = seq.duration / par.duration;
    const chunkedSpeedup = seq.duration / chunked.duration;
    
    console.log('');
    console.log(`  Speedup (Parallel):        ${speedup.toFixed(2)}x faster`);
    console.log(`  Speedup (Chunked):         ${chunkedSpeedup.toFixed(2)}x faster`);
    console.log(`  Best Strategy:             ${par.duration < chunked.duration ? 'Parallel' : 'Chunked Parallel'}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:\n');
  console.log('✅ For 1 batch:      All strategies are equivalent (~100ms)');
  console.log('✅ For 2-10 batches: Parallel is significantly faster (3-10x speedup)');
  console.log('✅ For 11+ batches:  Chunked Parallel provides good balance');
  console.log('⚠️  For 11+ batches: Parallel uses more connections (risk of pool exhaustion)');
  console.log('\n💡 Recommendation: Use executeBatchedQuery with auto-strategy');
  console.log('   It automatically chooses the best approach based on batch count!\n');
}

runBenchmark().catch(console.error);
