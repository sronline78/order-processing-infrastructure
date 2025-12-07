import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import ordersRouter from './routes/orders';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[API] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`
    );
  });
  next();
});

// Routes
app.use(healthRouter);
app.use(ordersRouter);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    service: 'Order Processing Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      apiHealth: '/api/health',
      orders: '/api/orders',
      stats: '/api/stats',
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
  });
});

let server: any;

/**
 * Start the Express API server
 */
export function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      server = app.listen(PORT, () => {
        console.log(`[API Server] Listening on port ${PORT}`);
        console.log(`[API Server] Environment: ${process.env.NODE_ENV || 'development'}`);
        resolve();
      });

      server.on('error', (error: Error) => {
        console.error('[API Server] Failed to start:', error);
        reject(error);
      });
    } catch (error) {
      console.error('[API Server] Initialization error:', error);
      reject(error);
    }
  });
}

/**
 * Stop the Express API server
 */
export function stopApiServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      console.log('[API Server] Shutting down...');
      server.close(() => {
        console.log('[API Server] Shut down complete');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export default app;
