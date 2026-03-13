'use strict';

const dotenv = require('dotenv');
dotenv.config();

const config = {
  db: {
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/exports_db',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 5000,
    },
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 8080,
    env: process.env.NODE_ENV || 'development',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  export: {
    batchSize: parseInt(process.env.EXPORT_BATCH_SIZE, 10) || 5000,
    tempDir: process.env.EXPORT_TEMP_DIR || '/tmp/exports',
  },
  // Whitelist of allowed DB columns for export queries
  allowedColumns: ['id', 'created_at', 'name', 'value', 'metadata'],
};

module.exports = config;
