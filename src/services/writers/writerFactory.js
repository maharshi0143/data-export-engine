'use strict';

const CsvWriter = require('./csvWriter');
const JsonWriter = require('./jsonWriter');
const XmlWriter = require('./xmlWriter');
const ParquetWriter = require('./parquetWriter');

const writers = {
  csv: CsvWriter,
  json: JsonWriter,
  xml: XmlWriter,
  parquet: ParquetWriter,
};

/**
 * Factory returning the appropriate writer instance for a given format.
 * @param {string} format - One of: csv, json, xml, parquet
 * @returns {CsvWriter|JsonWriter|XmlWriter|ParquetWriter}
 */
function getWriter(format) {
  const WriterClass = writers[format];
  if (!WriterClass) {
    throw new Error(`Unsupported export format: ${format}`);
  }
  return new WriterClass();
}

module.exports = { getWriter };
