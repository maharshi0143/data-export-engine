'use strict';

const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

const pool = new Pool({
  connectionString: config.db.connectionString,
  max: config.db.pool.max,
  idleTimeoutMillis: config.db.pool.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.pool.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

/**
 * Verify database connectivity.
 */
async function checkConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Database connection verified');
  } finally {
    client.release();
  }
}

/**
 * Gracefully shut down the pool.
 */
async function closePool() {
  logger.info('Closing database connection pool');
  await pool.end();
}

module.exports = { pool, checkConnection, closePool };
