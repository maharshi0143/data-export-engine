'use strict';

const { validateExportRequest } = require('../../src/middleware/validateExport');

function createMockReqRes(body) {
  const req = { body };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('validateExportRequest', () => {
  it('should pass valid CSV request', () => {
    const { req, res, next } = createMockReqRes({
      format: 'csv',
      columns: [{ source: 'id', target: 'record_id' }],
    });

    validateExportRequest(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should pass valid request with all formats', () => {
    for (const format of ['csv', 'json', 'xml', 'parquet']) {
      const { req, res, next } = createMockReqRes({
        format,
        columns: [
          { source: 'id', target: 'id' },
          { source: 'name', target: 'name' },
        ],
      });

      validateExportRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  });

  it('should pass valid request with gzip compression', () => {
    const { req, res, next } = createMockReqRes({
      format: 'csv',
      columns: [{ source: 'id', target: 'id' }],
      compression: 'gzip',
    });

    validateExportRequest(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should reject missing format', () => {
    const { req, res, next } = createMockReqRes({
      columns: [{ source: 'id', target: 'id' }],
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toContain('format is required');
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid format', () => {
    const { req, res, next } = createMockReqRes({
      format: 'xlsx',
      columns: [{ source: 'id', target: 'id' }],
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject missing columns', () => {
    const { req, res, next } = createMockReqRes({
      format: 'csv',
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject empty columns array', () => {
    const { req, res, next } = createMockReqRes({
      format: 'csv',
      columns: [],
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject disallowed source column (SQL injection prevention)', () => {
    const { req, res, next } = createMockReqRes({
      format: 'csv',
      columns: [{ source: "id; DROP TABLE records;--", target: 'id' }],
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid target column name', () => {
    const { req, res, next } = createMockReqRes({
      format: 'csv',
      columns: [{ source: 'id', target: 'bad column!' }],
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject gzip compression for parquet', () => {
    const { req, res, next } = createMockReqRes({
      format: 'parquet',
      columns: [{ source: 'id', target: 'id' }],
      compression: 'gzip',
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.stringContaining('compression is not supported for parquet'),
      ])
    );
  });

  it('should reject duplicate source columns', () => {
    const { req, res, next } = createMockReqRes({
      format: 'csv',
      columns: [
        { source: 'id', target: 'id1' },
        { source: 'id', target: 'id2' },
      ],
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid compression value', () => {
    const { req, res, next } = createMockReqRes({
      format: 'csv',
      columns: [{ source: 'id', target: 'id' }],
      compression: 'bzip2',
    });

    validateExportRequest(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });
});
