'use strict';

const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const { createDbStream } = require('./dbStreamService');
const { getWriter } = require('./writers/writerFactory');
const ParquetWriter = require('./writers/parquetWriter');
const config = require('../utils/config');
const logger = require('../utils/logger');

const ALL_COLUMNS = [
  { source: 'id', target: 'id' },
  { source: 'created_at', target: 'created_at' },
  { source: 'name', target: 'name' },
  { source: 'value', target: 'value' },
  { source: 'metadata', target: 'metadata' },
];

/**
 * Run performance benchmarks for all 4 export formats.
 * Exports full 10M rows to temp files, measures duration/size/memory.
 *
 * @returns {Promise<Object>} benchmark results
 */
async function runBenchmark() {
  const formats = ['csv', 'json', 'xml', 'parquet'];
  const results = [];

  const tempDir = config.export.tempDir;
  await fs.promises.mkdir(tempDir, { recursive: true });

  // Get the row count
  const { pool } = require('../utils/db');
  const countResult = await pool.query('SELECT COUNT(*) AS count FROM records');
  const rowCount = parseInt(countResult.rows[0].count, 10);

  for (const format of formats) {
    logger.info(`Benchmark starting for format: ${format}`);

    const filePath = path.join(tempDir, `benchmark_${format}_${Date.now()}.${format}`);
    let peakMemoryBytes = 0;

    // Sample memory usage periodically
    const memInterval = setInterval(() => {
      const mem = process.memoryUsage();
      if (mem.heapUsed > peakMemoryBytes) {
        peakMemoryBytes = mem.heapUsed;
      }
    }, 100);

    const baselineMemory = process.memoryUsage().heapUsed;
    peakMemoryBytes = baselineMemory;
    const startTime = process.hrtime.bigint();

    try {
      if (format === 'parquet') {
        await benchmarkParquet(filePath);
      } else {
        await benchmarkStreamFormat(format, filePath);
      }

      const endTime = process.hrtime.bigint();
      clearInterval(memInterval);

      const durationNs = Number(endTime - startTime);
      const durationSeconds = parseFloat((durationNs / 1e9).toFixed(2));

      const stats = await fs.promises.stat(filePath);
      const fileSizeBytes = stats.size;
      const peakMemoryMB = parseFloat((peakMemoryBytes / (1024 * 1024)).toFixed(2));

      results.push({
        format,
        durationSeconds,
        fileSizeBytes,
        peakMemoryMB,
      });

      logger.info(`Benchmark completed for ${format}`, {
        durationSeconds,
        fileSizeBytes,
        peakMemoryMB,
      });
    } catch (err) {
      clearInterval(memInterval);
      logger.error(`Benchmark failed for ${format}`, { error: err.message });
      results.push({
        format,
        durationSeconds: 0,
        fileSizeBytes: 0,
        peakMemoryMB: 0,
        error: err.message,
      });
    } finally {
      // Clean up temp file
      try {
        await fs.promises.unlink(filePath);
      } catch (_) {
        // ignore
      }
    }
  }

  return {
    datasetRowCount: rowCount,
    results,
  };
}

/**
 * Benchmark a streaming format (CSV, JSON, XML) by writing to file.
 */
async function benchmarkStreamFormat(format, filePath) {
  const writer = getWriter(format);
  const dbStream = createDbStream(ALL_COLUMNS);
  const { input, output } = writer.createStream(ALL_COLUMNS);

  const fileStream = fs.createWriteStream(filePath);

  dbStream.pipe(input);
  output.pipe(fileStream);

  await new Promise((resolve, reject) => {
    fileStream.on('finish', resolve);
    dbStream.on('error', reject);
    input.on('error', reject);
    output.on('error', reject);
    fileStream.on('error', reject);
  });
}

/**
 * Benchmark Parquet by writing to file (already file-based).
 */
async function benchmarkParquet(filePath) {
  const writer = getWriter('parquet');
  const dbStream = createDbStream(ALL_COLUMNS);

  // ParquetWriter.writeToFile writes to its own temp path;
  // we'll override by giving it the benchmark path directly.
  const parquetWriter = new ParquetWriter();

  // Override tempDir config temporarily
  const origTempDir = config.export.tempDir;
  config.export.tempDir = path.dirname(filePath);

  const resultPath = await parquetWriter.writeToFile(ALL_COLUMNS, dbStream);

  config.export.tempDir = origTempDir;

  // Rename to expected benchmark path if different
  if (resultPath !== filePath) {
    await fs.promises.rename(resultPath, filePath);
  }
}

module.exports = { runBenchmark };
