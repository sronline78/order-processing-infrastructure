import { initializeDatabase, closeDatabase } from './database';
import { startApiServer, stopApiServer } from './api-server';
import { startSqsWorker, stopSqsWorker } from './sqs-handler';

let isShuttingDown = false;

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log('[Main] Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log(`[Main] Received ${signal}, starting graceful shutdown...`);

  try {
    // Stop accepting new requests and processing new messages
    console.log('[Main] Stopping API server...');
    await stopApiServer();

    console.log('[Main] Stopping SQS worker...');
    await stopSqsWorker();

    // Close database connections
    console.log('[Main] Closing database connections...');
    await closeDatabase();

    console.log('[Main] Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('[Main] Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Main application startup
 */
async function main(): Promise<void> {
  console.log('=================================================');
  console.log('   Order Processing Backend Service');
  console.log('=================================================');
  console.log(`[Main] Starting application...`);
  console.log(`[Main] Node version: ${process.version}`);
  console.log(`[Main] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('=================================================');

  try {
    // Validate required environment variables
    const requiredEnvVars = ['QUEUE_URL', 'DB_SECRET_ARN'];
    const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

    if (missingEnvVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingEnvVars.join(', ')}`
      );
    }

    console.log('[Main] Environment variables validated');
    console.log(`[Main] Queue URL: ${process.env.QUEUE_URL}`);
    console.log(`[Main] DB Secret ARN: ${process.env.DB_SECRET_ARN}`);

    // Initialize database connection
    console.log('[Main] Initializing database...');
    await initializeDatabase();
    console.log('[Main] Database initialized successfully');

    // Start API server
    console.log('[Main] Starting API server...');
    await startApiServer();
    console.log('[Main] API server started successfully');

    // Start SQS worker
    console.log('[Main] Starting SQS worker...');
    await startSqsWorker();
    console.log('[Main] SQS worker started successfully');

    console.log('=================================================');
    console.log('[Main] Application startup complete');
    console.log('[Main] Running dual process pattern:');
    console.log('[Main]   - Express API server (port 3000)');
    console.log('[Main]   - SQS worker (background polling)');
    console.log('=================================================');
  } catch (error) {
    console.error('[Main] Failed to start application:', error);
    process.exit(1);
  }
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  console.error('[Main] Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the application
main().catch((error) => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});
