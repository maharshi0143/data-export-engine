'use strict';

const { Readable } = require('stream');
const CsvWriter = require('../../src/services/writers/csvWriter');
const JsonWriter = require('../../src/services/writers/jsonWriter');
const XmlWriter = require('../../src/services/writers/xmlWriter');

const TEST_COLUMNS = [
  { source: 'id', target: 'id' },
  { source: 'name', target: 'full_name' },
  { source: 'value', target: 'amount' },
  { source: 'metadata', target: 'meta' },
];

const TEST_ROWS = [
  {
    id: 1,
    full_name: 'Record 1',
    amount: 123.45,
    meta: { description: 'desc', tags: ['a', 'b'], attributes: { priority: 1 } },
  },
  {
    id: 2,
    full_name: 'Record 2',
    amount: 678.9,
    meta: { description: 'desc2', tags: ['c'], attributes: { priority: 3 } },
  },
  {
    id: 3,
    full_name: 'Record "Special" <chars> & more',
    amount: 0,
    meta: null,
  },
];

function createMockDbStream(rows) {
  let index = 0;
  return new Readable({
    objectMode: true,
    read() {
      if (index < rows.length) {
        this.push(rows[index++]);
      } else {
        this.push(null);
      }
    },
  });
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : c))).toString('utf8')));
    stream.on('error', reject);
  });
}

// ─── CSV Tests ───────────────────────────────────────────────────────
describe('CsvWriter', () => {
  it('should produce valid CSV with headers', async () => {
    const writer = new CsvWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream(TEST_ROWS);

    dbStream.pipe(input);
    const result = await streamToString(output);

    // Should have header row
    const lines = result.trim().split('\n');
    expect(lines[0]).toBe('id,full_name,amount,meta');

    // Should have 3 data rows
    expect(lines.length).toBe(4); // 1 header + 3 rows
  });

  it('should serialize metadata as JSON string', async () => {
    const writer = new CsvWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream([TEST_ROWS[0]]);

    dbStream.pipe(input);
    const result = await streamToString(output);

    // The metadata should be serialized as JSON string
    expect(result).toContain('description');
    expect(result).toContain('tags');
  });

  it('should report correct content type', () => {
    const writer = new CsvWriter();
    expect(writer.contentType).toBe('text/csv');
    expect(writer.fileExtension).toBe('csv');
  });
});

// ─── JSON Tests ──────────────────────────────────────────────────────
describe('JsonWriter', () => {
  it('should produce valid JSON array', async () => {
    const writer = new JsonWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream(TEST_ROWS);

    dbStream.pipe(input);
    const result = await streamToString(output);

    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
  });

  it('should preserve metadata as native object', async () => {
    const writer = new JsonWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream([TEST_ROWS[0]]);

    dbStream.pipe(input);
    const result = await streamToString(output);

    const parsed = JSON.parse(result);
    expect(typeof parsed[0].meta).toBe('object');
    expect(parsed[0].meta.description).toBe('desc');
    expect(parsed[0].meta.tags).toEqual(['a', 'b']);
  });

  it('should produce empty array for no rows', async () => {
    const writer = new JsonWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream([]);

    dbStream.pipe(input);
    const result = await streamToString(output);

    expect(JSON.parse(result)).toEqual([]);
  });

  it('should report correct content type', () => {
    const writer = new JsonWriter();
    expect(writer.contentType).toBe('application/json');
  });
});

// ─── XML Tests ───────────────────────────────────────────────────────
describe('XmlWriter', () => {
  it('should produce valid XML with root and record elements', async () => {
    const writer = new XmlWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream(TEST_ROWS);

    dbStream.pipe(input);
    const result = await streamToString(output);

    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('<records>');
    expect(result).toContain('</records>');
    expect(result).toContain('<record>');
    expect(result).toContain('</record>');
  });

  it('should convert metadata to nested XML elements', async () => {
    const writer = new XmlWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream([TEST_ROWS[0]]);

    dbStream.pipe(input);
    const result = await streamToString(output);

    expect(result).toContain('<meta>');
    expect(result).toContain('<description>desc</description>');
    expect(result).toContain('<tags>');
    expect(result).toContain('<item>a</item>');
    expect(result).toContain('<attributes>');
    expect(result).toContain('<priority>1</priority>');
  });

  it('should escape special XML characters', async () => {
    const writer = new XmlWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream([TEST_ROWS[2]]);

    dbStream.pipe(input);
    const result = await streamToString(output);

    expect(result).toContain('&amp;');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&quot;');
  });

  it('should handle empty dataset', async () => {
    const writer = new XmlWriter();
    const { input, output } = writer.createStream(TEST_COLUMNS);
    const dbStream = createMockDbStream([]);

    dbStream.pipe(input);
    const result = await streamToString(output);

    expect(result).toContain('<records>');
    expect(result).toContain('</records>');
    expect(result).not.toContain('<record>');
  });

  it('should report correct content type', () => {
    const writer = new XmlWriter();
    expect(writer.contentType).toBe('application/xml');
  });
});
