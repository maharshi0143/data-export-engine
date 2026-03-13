# Data Export Engine

A high-performance, memory-efficient data export engine that streams large datasets (10M+ rows) into multiple formats: **CSV**, **JSON**, **XML**, and **Parquet**. Built with Node.js, Express, PostgreSQL, and Docker.

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│   Client     │────▶│  Express Server (256MB memory limit)     │
│  (curl/app)  │◀────│                                          │
└─────────────┘     │  ┌──────────┐  ┌───────────────────────┐ │
                    │  │Middleware │  │  Export Controller     │ │
                    │  │• Validate│  │  • POST /exports       │ │
                    │  │• RateLimit│  │  • GET  /download     │ │
                    │  │• Logging │  │  • GET  /benchmark     │ │
                    │  └──────────┘  └───────────┬───────────┘ │
                    │                            │             │
                    │  ┌─────────────────────────▼───────────┐ │
                    │  │  Writer Factory (Strategy Pattern)   │ │
                    │  │  CSV │ JSON │ XML │ Parquet          │ │
                    │  └─────────────────────────┬───────────┘ │
                    │                            │             │
                    │  ┌─────────────────────────▼───────────┐ │
                    │  │  DB Stream Service (pg-cursor)       │ │
                    │  │  Server-side cursor → Readable stream│ │
                    │  └─────────────────────────┬───────────┘ │
                    └────────────────────────────│─────────────┘
                                                 │
                    ┌────────────────────────────▼─────────────┐
                    │  PostgreSQL 13 (10M rows seeded)         │
                    │  Table: records (id, created_at, name,   │
                    │         value, metadata JSONB)            │
                    └──────────────────────────────────────────┘
```

### Key Design Decisions

- **Streaming**: All exports use server-side PostgreSQL cursors (`pg-cursor`) to read rows in batches, ensuring constant ~50MB memory usage regardless of dataset size.
- **Strategy Pattern**: Each export format is a self-contained writer class behind a factory. Adding new formats (Avro, ORC) requires only a new writer file + one line in the factory.
- **Security**: Column names are whitelisted (not interpolated from user input). Export IDs are UUID v4 (cryptographically random). Helmet, CORS, and rate limiting are applied globally.

## Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- No other dependencies — everything runs in containers

## Quick Start

```bash
# Clone and start
git clone <repo-url>
cd data-export-engine

# Start all services (PostgreSQL + App)
docker-compose up --build

# Wait for database seeding (~2-5 minutes for 10M rows)
# The app will start automatically after the database is healthy
```

The application will be available at `http://localhost:8080`.

## API Documentation

### Health Check

```
GET /health
```

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-12T10:00:00.000Z",
  "uptime": 120.5,
  "database": "connected"
}
```

### Create Export Job

```
POST /exports
Content-Type: application/json
```

**Request Body:**
```json
{
  "format": "csv",
  "columns": [
    { "source": "id", "target": "record_id" },
    { "source": "name", "target": "full_name" },
    { "source": "value", "target": "amount" },
    { "source": "metadata", "target": "meta" },
    { "source": "created_at", "target": "date" }
  ],
  "compression": "gzip"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | Yes | One of: `csv`, `json`, `xml`, `parquet` |
| `columns` | array | Yes | Column mappings (source → target rename) |
| `columns[].source` | string | Yes | DB column: `id`, `created_at`, `name`, `value`, `metadata` |
| `columns[].target` | string | Yes | Output column name (alphanumeric + underscore) |
| `compression` | string | No | `gzip` (not available for `parquet`) |

**Response (201):**
```json
{
  "exportId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/exports \
  -H "Content-Type: application/json" \
  -d '{
    "format": "csv",
    "columns": [
      {"source": "id", "target": "id"},
      {"source": "name", "target": "name"},
      {"source": "value", "target": "value"},
      {"source": "metadata", "target": "metadata"},
      {"source": "created_at", "target": "created_at"}
    ]
  }'
```

### Download Export

```
GET /exports/:exportId/download
```

Streams the export data in the requested format. The response is streamed directly — the entire dataset is never held in memory.

**Headers by Format:**

| Format | Content-Type | Content-Disposition |
|--------|-------------|-------------------|
| CSV | `text/csv` | `attachment; filename="export_<id>.csv"` |
| JSON | `application/json` | `attachment; filename="export_<id>.json"` |
| XML | `application/xml` | `attachment; filename="export_<id>.xml"` |
| Parquet | `application/octet-stream` | `attachment; filename="export_<id>.parquet"` |

With `compression: "gzip"`, includes `Content-Encoding: gzip`.

**Example:**
```bash
# Download CSV
curl -o export.csv http://localhost:8080/exports/<exportId>/download

# Download gzip-compressed CSV
curl --compressed -o export.csv.gz http://localhost:8080/exports/<exportId>/download
```

### Performance Benchmark

```
GET /exports/benchmark
```

Exports all 10M rows in all 4 formats, measuring duration, file size, and peak memory. Rate-limited to 1 request per 5 minutes.

**Response (200):**
```json
{
  "datasetRowCount": 10000000,
  "results": [
    {
      "format": "csv",
      "durationSeconds": 45.2,
      "fileSizeBytes": 1234567890,
      "peakMemoryMB": 48.5
    },
    {
      "format": "json",
      "durationSeconds": 52.1,
      "fileSizeBytes": 2345678901,
      "peakMemoryMB": 51.2
    },
    {
      "format": "xml",
      "durationSeconds": 60.3,
      "fileSizeBytes": 3456789012,
      "peakMemoryMB": 49.8
    },
    {
      "format": "parquet",
      "durationSeconds": 80.7,
      "fileSizeBytes": 456789012,
      "peakMemoryMB": 55.1
    }
  ]
}
```

## Nested Data Handling (metadata JSONB)

The `metadata` column contains nested JSON:
```json
{
  "description": "Sample description",
  "tags": ["tag1", "tag2"],
  "attributes": { "priority": 3, "category": "cat5" }
}
```

Each format handles it differently:

| Format | Strategy |
|--------|----------|
| **CSV** | Serialized as a JSON string within the cell |
| **JSON** | Passed through as a native JSON object |
| **XML** | Converted to nested XML elements (objects → child elements, arrays → repeated `<item>` elements) |
| **Parquet** | Stored as a UTF8 JSON string (maximum compatibility) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/exports_db` | PostgreSQL connection string |
| `PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `development` | Environment (`production` hides error details) |
| `LOG_LEVEL` | `info` | Winston log level |
| `EXPORT_BATCH_SIZE` | `5000` | Rows per cursor fetch (memory vs. speed) |
| `EXPORT_TEMP_DIR` | `/tmp/exports` | Temp directory for Parquet files |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `DB_POOL_MAX` | `10` | Max database pool connections |

## Project Structure

```
data-export-engine/
├── docker-compose.yml          # Service orchestration
├── Dockerfile                  # Multi-stage production build
├── package.json
├── .env.example                # Environment variable template
├── seeds/
│   └── init-db.sql             # Idempotent schema + 10M row seed
├── src/
│   ├── index.js                # Express app entry point
│   ├── controllers/
│   │   └── exportController.js # Route handlers
│   ├── middleware/
│   │   ├── errorHandler.js     # Global error handler
│   │   ├── rateLimiter.js      # Rate limiting
│   │   ├── requestLogger.js    # HTTP request logging
│   │   └── validateExport.js   # Input validation & sanitization
│   ├── services/
│   │   ├── benchmarkService.js # Performance benchmarking
│   │   ├── dbStreamService.js  # PostgreSQL cursor streaming
│   │   ├── jobStore.js         # In-memory job management
│   │   └── writers/
│   │       ├── csvWriter.js    # CSV streaming (fast-csv)
│   │       ├── jsonWriter.js   # JSON streaming (custom transform)
│   │       ├── xmlWriter.js    # XML streaming (custom transform)
│   │       ├── parquetWriter.js# Parquet file writer (parquetjs)
│   │       └── writerFactory.js# Strategy pattern factory
│   └── utils/
│       ├── config.js           # Centralized configuration
│       ├── db.js               # PostgreSQL connection pool
│       └── logger.js           # Winston logger
├── tests/
│   └── unit/
│       ├── writers.test.js     # Writer format tests
│       ├── validation.test.js  # Validation middleware tests
│       ├── jobStore.test.js    # Job store tests
│       └── writerFactory.test.js
└── logs/                       # Runtime logs (git-ignored)
```

## Running Tests

```bash
# Install dev dependencies locally
npm install

# Run all tests
npm test

# Run with verbose output
npm run test:verbose
```

## Security

- **SQL Injection Prevention**: Column names are validated against a strict whitelist — no user input is ever interpolated into SQL queries.
- **UUID v4 Export IDs**: Cryptographically random, non-guessable job identifiers.
- **Helmet**: Sets security HTTP headers (CSP, HSTS, etc.).
- **Rate Limiting**: Global rate limiting + stricter limits on the benchmark endpoint.
- **Non-root Container**: Application runs as a dedicated `nodejs` user inside Docker.
- **Input Validation**: All request bodies are validated before processing; target column names must match `^[a-zA-Z_][a-zA-Z0-9_]*$`.
- **Error Sanitization**: Stack traces and internal errors are hidden in production mode.
- **Memory Limit**: Hard 256MB container limit enforces streaming discipline.

## Performance Characteristics

| Format | File Size | Speed | Compression | Use Case |
|--------|-----------|-------|-------------|----------|
| CSV | Medium | Fast | Low | Spreadsheets, data tools |
| JSON | Large | Medium | Low | Web APIs, JavaScript apps |
| XML | Largest | Slowest | Lowest | Enterprise/legacy systems |
| Parquet | Smallest | Varies | High (built-in) | Analytics, data warehouses |

## License

ISC
