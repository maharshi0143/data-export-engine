'use strict';

const { Readable } = require('stream');
const Cursor = require('pg-cursor');
const { pool } = require('../utils/db');
const config = require('../utils/config');
const logger = require('../utils/logger');

/**
 * Creates a Readable stream that fetches rows from the records table
 * using a PostgreSQL server-side cursor for constant memory usage.
 *
 * @param {Array<{source: string, target: string}>} columns - Column mappings
 * @param {number} [batchSize] - Number of rows per cursor fetch
 * @returns {Readable} Object-mode readable stream of row objects
 */
function createDbStream(columns, batchSize) {
  const fetchSize = batchSize || config.export.batchSize;

  // Build SELECT clause using only whitelisted column names
  const selectCols = columns
    .map((col) => {
      if (col.source === col.target) {
        return `"${col.source}"`;
      }
      return `"${col.source}" AS "${col.target}"`;
    })
    .join(', ');

  const queryText = `SELECT ${selectCols} FROM records ORDER BY id`;

  let client = null;
  let cursor = null;
  let destroyed = false;

  const stream = new Readable({
    objectMode: true,
    highWaterMark: fetchSize,

    async read() {
      try {
        // Acquire client on first read
        if (!client) {
          client = await pool.connect();
          cursor = client.query(new Cursor(queryText));
        }

        const rows = await cursor.read(fetchSize);

        if (rows.length === 0) {
          // No more rows — close cursor and release client
          await cleanup();
          this.push(null);
          return;
        }

        for (const row of rows) {
          if (!this.push(row)) {
            // Back-pressure: stop pushing until next read() call
            break;
          }
        }
      } catch (err) {
        logger.error('Database stream error', { error: err.message });
        await cleanup();
        this.destroy(err);
      }
    },

    destroy(err, callback) {
      cleanup()
        .then(() => callback(err))
        .catch((cleanupErr) => {
          logger.error('Error during stream cleanup', { error: cleanupErr.message });
          callback(err || cleanupErr);
        });
    },
  });

  async function cleanup() {
    if (destroyed) return;
    destroyed = true;
    try {
      if (cursor) {
        await cursor.close();
      }
    } catch (e) {
      logger.error('Error closing cursor', { error: e.message });
    }
    if (client) {
      client.release();
      client = null;
    }
  }

  return stream;
}

module.exports = { createDbStream };
