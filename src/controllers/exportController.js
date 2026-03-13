'use strict';

const fs = require('fs');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { createDbStream } = require('../services/dbStreamService');
const jobStore = require('../services/jobStore');
const { getWriter } = require('../services/writers/writerFactory');
const ParquetWriter = require('../services/writers/parquetWriter');
const logger = require('../utils/logger');

/**
 * POST /exports — Create a new export job.
 */
async function createExport(req, res) {
  const { format, columns, compression } = req.body;

  const job = jobStore.createJob({ format, columns, compression });

  logger.info('Export job created', { exportId: job.exportId, format, compression });

  res.status(201).json({
    exportId: job.exportId,
    status: job.status,
  });
}

/**
 * GET /exports/:exportId/download — Stream export data.
 */
async function downloadExport(req, res) {
  const { exportId } = req.params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(exportId)) {
    return res.status(400).json({ error: 'Invalid export ID format' });
  }

  const job = jobStore.getJob(exportId);
  if (!job) {
    return res.status(404).json({ error: 'Export job not found' });
  }

  jobStore.updateJobStatus(exportId, 'processing');

  try {
    const writer = getWriter(job.format);

    // ---- Parquet: special handling (write to file, then stream) ----
    if (job.format === 'parquet') {
      const dbStream = createDbStream(job.columns);
      const filePath = await writer.writeToFile(job.columns, dbStream);

      res.setHeader('Content-Type', writer.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="export_${exportId}.${writer.fileExtension}"`
      );

      const fileStream = fs.createReadStream(filePath);
      fileStream.on('end', () => {
        ParquetWriter.cleanupFile(filePath);
      });
      fileStream.on('error', (err) => {
        logger.error('Error streaming parquet file', { error: err.message });
        ParquetWriter.cleanupFile(filePath);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Export failed' });
        }
      });

      fileStream.pipe(res);
      jobStore.updateJobStatus(exportId, 'completed');
      return;
    }

    // ---- Streaming formats: CSV, JSON, XML ----
    const dbStream = createDbStream(job.columns);
    const { input, output } = writer.createStream(job.columns);

    res.setHeader('Content-Type', writer.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="export_${exportId}.${writer.fileExtension}"`
    );

    // Set up the pipeline: dbStream -> writer input -> writer output -> [gzip] -> response
    if (job.compression === 'gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      const gzip = zlib.createGzip();
      dbStream.pipe(input);
      output.pipe(gzip).pipe(res);

      await new Promise((resolve, reject) => {
        res.on('finish', resolve);
        dbStream.on('error', reject);
        input.on('error', reject);
        output.on('error', reject);
        gzip.on('error', reject);
      });
    } else {
      dbStream.pipe(input);
      output.pipe(res);

      await new Promise((resolve, reject) => {
        res.on('finish', resolve);
        dbStream.on('error', reject);
        input.on('error', reject);
        output.on('error', reject);
      });
    }

    jobStore.updateJobStatus(exportId, 'completed');
    logger.info('Export download completed', { exportId, format: job.format });
  } catch (err) {
    logger.error('Export download failed', {
      exportId,
      error: err.message,
      stack: err.stack,
    });
    jobStore.updateJobStatus(exportId, 'failed', err.message);

    if (!res.headersSent) {
      res.status(500).json({ error: 'Export failed', message: err.message });
    } else {
      res.end();
    }
  }
}

module.exports = { createExport, downloadExport };
