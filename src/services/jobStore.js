'use strict';

const crypto = require('crypto');

// In-memory store for export jobs
const jobs = new Map();

function createJob({ format, columns, compression }) {
  const exportId = crypto.randomUUID();
  const job = {
    exportId,
    format,
    columns,
    compression: compression || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    error: null,
  };
  jobs.set(exportId, job);
  return job;
}

function getJob(exportId) {
  return jobs.get(exportId) || null;
}

function updateJobStatus(exportId, status, error) {
  const job = jobs.get(exportId);
  if (!job) return null;
  job.status = status;
  if (error !== undefined) {
    job.error = error;
  }
  return job;
}

module.exports = { createJob, getJob, updateJobStatus };
