# Order Processing Backend Service

A production-ready Node.js/TypeScript backend service for processing orders using Express API and SQS worker pattern.

## Architecture

This application implements a **dual process pattern**:

1. **Express API Server** (port 3000) - Handles HTTP requests from frontend
2. **SQS Worker** (background thread) - Polls SQS queue and processes orders

## Features

- RESTful API with Express
- SQS message processing with long polling
- PostgreSQL persistence with connection pooling
- AWS Secrets Manager integration for database credentials
- Graceful shutdown handling (SIGTERM/SIGINT)
- Comprehensive health checks
- Request logging for CloudWatch
- Multi-stage Docker build
- Non-root container user

## API Endpoints

### Health Checks
- `GET /health` - Simple health check (for ALB)
- `GET /api/health` - Comprehensive health check (DB + SQS)

### Orders
- `GET /api/orders?page=1&limit=50` - List orders (paginated)
- `GET /api/orders/:orderId` - Get single order
- `POST /api/orders` - Submit new order (async via SQS)
- `GET /api/stats` - Order statistics and queue depth

## Environment Variables

Required:
- `QUEUE_URL` - SQS queue URL
- `DB_SECRET_ARN` - AWS Secrets Manager ARN for database credentials

Optional:
- `NODE_ENV` - Environment (production/development)
- `PORT` - API server port (default: 3000)

## Database Schema

```sql
CREATE TABLE orders (
  order_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  items JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Development

### Install Dependencies
```bash
npm install
```

### Run in Development Mode
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Run Production Build
```bash
npm start
```

## Docker

### Build Image
```bash
docker build -t order-processing-backend .
```

### Run Container
```bash
docker run -p 3000:3000 \
  -e QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/orders-queue \
  -e DB_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789:secret:db-creds \
  order-processing-backend
```

## Order Submission Flow

1. Client sends POST request to `/api/orders`
2. API validates order data
3. Order is sent to SQS queue
4. API returns 202 Accepted with order ID
5. SQS worker polls queue
6. Worker processes order and inserts into PostgreSQL
7. Message deleted from queue on success
8. Failed messages retry up to 3 times, then move to DLQ

## Error Handling

- **Database errors**: Logged and returned as 500 errors
- **SQS errors**: Logged, messages left in queue for retry
- **Validation errors**: Returned as 400 Bad Request
- **Graceful shutdown**: Properly closes DB connections and stops workers

## Logging

All logs are written to stdout/stderr for CloudWatch ingestion:
- API request/response logs
- Database operation logs
- SQS message processing logs
- Error logs with stack traces

## Performance

- **Connection pooling**: Max 20 PostgreSQL connections
- **Long polling**: 20-second SQS wait time
- **Batch processing**: Up to 10 messages per poll
- **Indexed queries**: Optimized for common access patterns

## Security

- Non-root container user (uid: 1001)
- Secrets from AWS Secrets Manager
- Input validation on all endpoints
- CORS enabled
- Request size limits (10MB)

## Monitoring

Health check endpoint includes:
- Database connectivity status
- SQS queue connectivity
- Approximate queue depth
- Service uptime

## License

ISC
