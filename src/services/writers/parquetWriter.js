'use strict';

const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const parquet = require('parquetjs');
const config = require('../../utils/config');
const logger = require('../../utils/logger');

/**
 * Parquet Writer — writes rows to a temporary Parquet file,
 * then provides a readable stream of the binary file.
 *
 * Parquet requires random access writes (footer with metadata),
 * so we must write to file first, then stream it back.
 */
class ParquetWriter {
  constructor() {
    this.contentType = 'application/octet-stream';
    this.fileExtension = 'parquet';
  }

  /**
   * Write all rows from the dbStream to a Parquet file, then return the file path.
   *
   * @param {Array<{source: string, target: string}>} columns
   * @param {import('stream').Readable} dbStream - object-mode readable of DB rows
   * @returns {Promise<string>} filePath of the written Parquet file
   */
  async writeToFile(columns, dbStream) {
    const tempDir = config.export.tempDir;
    await fs.promises.mkdir(tempDir, { recursive: true });

    const filePath = path.join(
      tempDir,
      `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.parquet`
    );

    // Build Parquet schema from columns
    const schemaFields = {};
    for (const col of columns) {
      schemaFields[col.target] = this._getParquetType(col.source);
    }

    const schema = new parquet.ParquetSchema(schemaFields);
    const writer = await parquet.ParquetWriter.openFile(schema, filePath);

    // Set row group size for memory efficiency
    writer.setRowGroupSize(10000);

    try {
      await new Promise((resolve, reject) => {
        dbStream.on('data', async (row) => {
          try {
            dbStream.pause(); // back-pressure
            const record = {};
            for (const col of columns) {
              record[col.target] = this._convertValue(col.source, row[col.target]);
            }
            await writer.appendRow(record);
            dbStream.resume();
          } catch (err) {
            reject(err);
          }
        });

        dbStream.on('end', resolve);
        dbStream.on('error', reject);
      });
    } finally {
      await writer.close();
    }

    return filePath;
  }

  /**
   * Map DB column names to Parquet types.
   */
  _getParquetType(sourceColumn) {
    switch (sourceColumn) {
      case 'id':
        return { type: 'INT64' };
      case 'created_at':
        return { type: 'TIMESTAMP_MILLIS' };
      case 'name':
        return { type: 'UTF8' };
      case 'value':
        return { type: 'DOUBLE' };
      case 'metadata':
        // Store complex JSONB as a UTF8 string (JSON serialized)
        // parquetjs doesn't support full nested structs well,
        // so we serialize to string for reliability
        return { type: 'UTF8' };
      default:
        return { type: 'UTF8' };
    }
  }

  /**
   * Convert raw DB values to Parquet-compatible types.
   */
  _convertValue(sourceColumn, value) {
    if (value === null || value === undefined) return null;

    switch (sourceColumn) {
      case 'id':
        return typeof value === 'bigint' ? value : BigInt(value);
      case 'created_at':
        return value instanceof Date ? value : new Date(value);
      case 'value':
        return typeof value === 'number' ? value : parseFloat(value);
      case 'metadata':
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      default:
        return String(value);
    }
  }

  /**
   * Clean up a temp file.
   */
  static async cleanupFile(filePath) {
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      logger.warn('Failed to clean up temp parquet file', {
        filePath,
        error: err.message,
      });
    }
  }
}

module.exports = ParquetWriter;
