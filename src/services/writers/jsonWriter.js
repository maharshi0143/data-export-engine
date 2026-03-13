'use strict';

const { Transform } = require('stream');

/**
 * JSON Writer — streams rows as a single JSON array: [{...}, {...}, ...]
 * Nested JSONB (metadata) is passed through as native JSON objects.
 */
class JsonWriter {
  constructor() {
    this.contentType = 'application/json';
    this.fileExtension = 'json';
  }

  /**
   * @param {Array<{source: string, target: string}>} columns
   * @returns {{ input: Transform, output: Transform }}
   */
  createStream(columns) {
    let first = true;

    const jsonTransform = new Transform({
      objectMode: true,
      writableObjectMode: true,
      readableObjectMode: false,

      transform(row, _encoding, callback) {
        try {
          // Build object with only selected columns
          const obj = {};
          for (const col of columns) {
            obj[col.target] = row[col.target];
          }

          const json = JSON.stringify(obj);

          if (first) {
            first = false;
            callback(null, '[\n' + json);
          } else {
            callback(null, ',\n' + json);
          }
        } catch (err) {
          callback(err);
        }
      },

      flush(callback) {
        if (first) {
          // No rows at all
          callback(null, '[]');
        } else {
          callback(null, '\n]');
        }
      },
    });

    return { input: jsonTransform, output: jsonTransform };
  }
}

module.exports = JsonWriter;
