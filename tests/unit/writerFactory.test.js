'use strict';

const { getWriter } = require('../../src/services/writers/writerFactory');
const CsvWriter = require('../../src/services/writers/csvWriter');
const JsonWriter = require('../../src/services/writers/jsonWriter');
const XmlWriter = require('../../src/services/writers/xmlWriter');
const ParquetWriter = require('../../src/services/writers/parquetWriter');

describe('WriterFactory', () => {
  it('should return CsvWriter for csv format', () => {
    expect(getWriter('csv')).toBeInstanceOf(CsvWriter);
  });

  it('should return JsonWriter for json format', () => {
    expect(getWriter('json')).toBeInstanceOf(JsonWriter);
  });

  it('should return XmlWriter for xml format', () => {
    expect(getWriter('xml')).toBeInstanceOf(XmlWriter);
  });

  it('should return ParquetWriter for parquet format', () => {
    expect(getWriter('parquet')).toBeInstanceOf(ParquetWriter);
  });

  it('should throw for unsupported format', () => {
    expect(() => getWriter('xlsx')).toThrow('Unsupported export format: xlsx');
  });
});
