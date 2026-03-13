'use strict';

const { Transform } = require('stream');

/**
 * XML Writer — streams rows as a valid XML document.
 * Nested JSONB (metadata) is converted to nested XML elements.
 */
class XmlWriter {
  constructor() {
    this.contentType = 'application/xml';
    this.fileExtension = 'xml';
  }

  /**
   * @param {Array<{source: string, target: string}>} columns
   * @returns {{ input: Transform, output: Transform }}
   */
  createStream(columns) {
    let started = false;

    const xmlTransform = new Transform({
      objectMode: true,
      writableObjectMode: true,
      readableObjectMode: false,

      transform(row, _encoding, callback) {
        try {
          let chunk = '';
          if (!started) {
            started = true;
            chunk += '<?xml version="1.0" encoding="UTF-8"?>\n<records>\n';
          }

          chunk += '  <record>\n';
          for (const col of columns) {
            const val = row[col.target];
            chunk += valueToXml(col.target, val, 4);
          }
          chunk += '  </record>\n';

          callback(null, chunk);
        } catch (err) {
          callback(err);
        }
      },

      flush(callback) {
        if (!started) {
          callback(null, '<?xml version="1.0" encoding="UTF-8"?>\n<records>\n</records>');
        } else {
          callback(null, '</records>');
        }
      },
    });

    return { input: xmlTransform, output: xmlTransform };
  }
}

/**
 * Escape special XML characters.
 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Recursively convert a value to XML elements.
 * - Objects become nested elements
 * - Arrays become repeated elements with <item> wrapper
 * - Primitives become text content
 */
function valueToXml(tagName, value, indent) {
  const pad = ' '.repeat(indent);

  if (value === null || value === undefined) {
    return `${pad}<${tagName}/>\n`;
  }

  if (Array.isArray(value)) {
    let xml = `${pad}<${tagName}>\n`;
    for (const item of value) {
      xml += valueToXml('item', item, indent + 2);
    }
    xml += `${pad}</${tagName}>\n`;
    return xml;
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    let xml = `${pad}<${tagName}>\n`;
    for (const [key, val] of Object.entries(value)) {
      xml += valueToXml(key, val, indent + 2);
    }
    xml += `${pad}</${tagName}>\n`;
    return xml;
  }

  // Primitive
  return `${pad}<${tagName}>${escapeXml(value)}</${tagName}>\n`;
}

module.exports = XmlWriter;
