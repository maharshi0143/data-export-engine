'use strict';

const { Transform } = require('stream');
const { format } = require('@fast-csv/format');

/**
 * CSV Writer — streams rows as CSV with a header row.
 * Nested objects (metadata JSONB) are serialized as JSON strings in cells.
 */
class CsvWriter {
  constructor() {
    this.contentType = 'text/csv';
    this.fileExtension = 'csv';
  }

  /**
   * @param {Array<{source: string, target: string}>} columns
   * @returns {{ transform: Transform }} writable transform stream
   */
  createStream(columns) {
    const headers = columns.map((c) => c.target);

    const csvStream = format({
      headers,
      writeHeaders: true,
      alwaysWriteHeaders: true,
    });

    // Transform each DB row object to a flat array matching header order
    const rowTransform = new Transform({
      objectMode: true,
      transform(row, _encoding, callback) {
        try {
          const flatRow = {};
          for (const col of columns) {
            let val = row[col.target];
            // Serialize objects/arrays as JSON strings for CSV
            if (val !== null && typeof val === 'object') {
              val = JSON.stringify(val);
            }
            flatRow[col.target] = val;
          }
          callback(null, flatRow);
        } catch (err) {
          callback(err);
        }
      },
    });

    // Pipe: rowTransform -> csvStream
    rowTransform.pipe(csvStream);

    // Return csvStream as the output, rowTransform as input
    return { input: rowTransform, output: csvStream };
  }
}

module.exports = CsvWriter;
