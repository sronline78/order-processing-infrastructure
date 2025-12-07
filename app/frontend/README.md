# Order Processing Frontend

React + TypeScript dashboard for the order processing system.

## Features

- Real-time order monitoring
- System health indicators
- Order submission form
- Statistics dashboard
- Auto-refreshing data (10-second intervals)
- Responsive design with Tailwind CSS

## Tech Stack

- React 19
- TypeScript
- Vite (build tool)
- TanStack Query (data fetching)
- Recharts (data visualization)
- Tailwind CSS (styling)
- nginx (production server)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm preview
```

## Environment Variables

Create a `.env` file (optional):

```env
# API URL (defaults to same host if not specified)
VITE_API_URL=http://localhost:8000
```

## Docker

```bash
# Build image
docker build -t order-processing-frontend .

# Run container
docker run -p 80:80 order-processing-frontend
```

## Architecture

### Components

- **Dashboard**: Main container component
- **StatsCards**: Display key metrics (orders today, processing rate, etc.)
- **SystemStatus**: Health indicators for API, database, and queue
- **OrderList**: Paginated table of recent orders
- **SubmitOrder**: Form to create new orders

### API Integration

The `src/services/api.ts` module handles all API communication:

- `getOrders(page, limit)`: Fetch paginated orders
- `createOrder(order)`: Submit new order
- `getStats()`: Get dashboard statistics
- `getHealth()`: Check system health

### Auto-refresh

- Orders list: 10 seconds
- Statistics: 10 seconds
- Health status: 30 seconds

## nginx Configuration

The production build is served by nginx with:

- SPA routing (all routes serve index.html)
- Static asset caching (1 year)
- Gzip compression
- Security headers
- Health check endpoint at `/health`

## Production Deployment

The frontend is containerized and deployed to AWS ECS, sitting behind an Application Load Balancer that routes:

- `/` → Frontend (nginx)
- `/api/*` → Backend API

The API URL is automatically detected from the browser's host, so no environment configuration is needed in production.
