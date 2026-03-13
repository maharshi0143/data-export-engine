'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

// Utils
const config = require('./utils/config');
const logger = require('./utils/logger');
const { checkConnection, closePool } = require('./utils/db');

// Middleware
const { requestLogger } = require('./middleware/requestLogger');
const { generalLimiter, benchmarkLimiter } = require('./middleware/rateLimiter');
const { validateExportRequest } = require('./middleware/validateExport');
const { errorHandler } = require('./middleware/errorHandler');

// Controllers
const { createExport, downloadExport } = require('./controllers/exportController');

// Services
const { runBenchmark } = require('./services/benchmarkService');

const app = express();
const PORT = config.server.port;

// ─── Global Middleware ───────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);
app.use(generalLimiter);

// ─── Health Check ────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const { pool } = require('./utils/db');
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

// ─── Root Endpoint ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Data Export Engine',
    version: '1.0.0',
    description: 'High-performance streaming data export service',
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check endpoint' },
      {
        path: '/exports',
        method: 'POST',
        description: 'Create a new export job',
        body: {
          format: 'csv|json|xml|parquet',
          columns: [{ source: 'column_name', target: 'export_name' }],
          compression: 'gzip (optional)',
        },
      },
      {
        path: '/exports/:id/download',
        method: 'GET',
        description: 'Download completed export',
      },
      {
        path: '/exports/benchmark',
        method: 'GET',
        description: 'Run performance benchmark (10M rows)',
      },
    ],
  });
});

// ─── Export Routes ───────────────────────────────────────────────────

// Create export job
app.post('/exports', validateExportRequest, createExport);

// Benchmark (must be before :exportId route to avoid matching "benchmark" as an ID)
app.get('/exports/benchmark', benchmarkLimiter, async (req, res, next) => {
  try {
    logger.info('Benchmark requested');
    const results = await runBenchmark();
    res.status(200).json(results);
  } catch (err) {
    next(err);
  }
});

// Download export
app.get('/exports/:exportId/download', downloadExport);

// ─── Error Handling ──────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// Global error handler (must be last, 4-param signature)
app.use(errorHandler);

// ─── Server Startup ──────────────────────────────────────────────────
async function start() {
  try {
    await checkConnection();
    logger.info('Database connection established');
  } catch (err) {
    logger.error('Failed to connect to database', { error: err.message });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`Data Export Engine running on port ${PORT}`);
    console.log(`Data Export Engine running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await closePool();
      logger.info('Server and database pool closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

// Export for testing
module.exports = { app };