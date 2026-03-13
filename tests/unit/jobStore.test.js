'use strict';

const { createJob, getJob, updateJobStatus } = require('../../src/services/jobStore');

describe('JobStore', () => {
  it('should create a job with UUID and pending status', () => {
    const job = createJob({
      format: 'csv',
      columns: [{ source: 'id', target: 'id' }],
      compression: null,
    });

    expect(job.exportId).toBeDefined();
    expect(job.exportId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(job.status).toBe('pending');
    expect(job.format).toBe('csv');
    expect(job.createdAt).toBeDefined();
  });

  it('should retrieve a created job', () => {
    const job = createJob({
      format: 'json',
      columns: [{ source: 'name', target: 'name' }],
    });

    const retrieved = getJob(job.exportId);
    expect(retrieved).toEqual(job);
  });

  it('should return null for non-existing job', () => {
    expect(getJob('non-existent-id')).toBeNull();
  });

  it('should update job status', () => {
    const job = createJob({
      format: 'xml',
      columns: [{ source: 'id', target: 'id' }],
    });

    updateJobStatus(job.exportId, 'processing');
    expect(getJob(job.exportId).status).toBe('processing');

    updateJobStatus(job.exportId, 'completed');
    expect(getJob(job.exportId).status).toBe('completed');
  });

  it('should update job status with error', () => {
    const job = createJob({
      format: 'parquet',
      columns: [{ source: 'id', target: 'id' }],
    });

    updateJobStatus(job.exportId, 'failed', 'DB connection lost');
    const updated = getJob(job.exportId);
    expect(updated.status).toBe('failed');
    expect(updated.error).toBe('DB connection lost');
  });
});
