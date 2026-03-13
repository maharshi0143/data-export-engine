'use strict';

const config = require('../utils/config');

const VALID_FORMATS = ['csv', 'json', 'xml', 'parquet'];
const VALID_COMPRESSIONS = ['gzip'];
const COLUMN_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateExportRequest(req, res, next) {
  const errors = [];
  const { format, columns, compression } = req.body;

  // Validate format
  if (!format) {
    errors.push('format is required');
  } else if (!VALID_FORMATS.includes(format)) {
    errors.push(`format must be one of: ${VALID_FORMATS.join(', ')}`);
  }

  // Validate columns
  if (!columns) {
    errors.push('columns is required');
  } else if (!Array.isArray(columns) || columns.length === 0) {
    errors.push('columns must be a non-empty array');
  } else {
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (!col || typeof col !== 'object') {
        errors.push(`columns[${i}] must be an object with source and target`);
        continue;
      }
      if (!col.source || typeof col.source !== 'string') {
        errors.push(`columns[${i}].source is required and must be a string`);
      } else if (!config.allowedColumns.includes(col.source)) {
        errors.push(
          `columns[${i}].source "${col.source}" is not allowed. Allowed: ${config.allowedColumns.join(', ')}`
        );
      }
      if (!col.target || typeof col.target !== 'string') {
        errors.push(`columns[${i}].target is required and must be a string`);
      } else if (!COLUMN_NAME_REGEX.test(col.target)) {
        errors.push(
          `columns[${i}].target "${col.target}" contains invalid characters. Use alphanumeric and underscores only.`
        );
      }
    }

    // Check for duplicate source columns
    const sources = columns.filter((c) => c && c.source).map((c) => c.source);
    const uniqueSources = new Set(sources);
    if (uniqueSources.size !== sources.length) {
      errors.push('columns must not contain duplicate source values');
    }
  }

  // Validate compression
  if (compression !== undefined && compression !== null) {
    if (!VALID_COMPRESSIONS.includes(compression)) {
      errors.push(`compression must be one of: ${VALID_COMPRESSIONS.join(', ')}`);
    }
    if (format === 'parquet' && compression) {
      errors.push('compression is not supported for parquet format (already compressed)');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  next();
}

module.exports = { validateExportRequest };
