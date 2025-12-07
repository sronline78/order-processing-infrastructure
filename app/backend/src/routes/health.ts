import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../database';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

const router = Router();

/**
 * Simple health check for ALB target group
 * Returns 200 OK if the service is running
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Comprehensive health check for API
 * Checks database and SQS connectivity
 */
router.get('/api/health', async (_req: Request, res: Response) => {
  let dbHealthy = false;
  let sqsHealthy = false;

  // Check database connectivity
  try {
    dbHealthy = await checkDatabaseHealth();
  } catch (error) {
    console.error('[Health] Database check failed:', error);
  }

  // Check SQS connectivity
  try {
    const queueUrl = process.env.QUEUE_URL;
    if (queueUrl) {
      const sqsClient = new SQSClient({});
      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      });
      await sqsClient.send(command);
      sqsHealthy = true;
    }
  } catch (error) {
    console.error('[Health] SQS check failed:', error);
  }

  // Return health status in frontend-expected format
  const allHealthy = dbHealthy && sqsHealthy;
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'healthy' : 'degraded',
    database: {
      status: dbHealthy ? 'connected' : 'disconnected',
    },
    queue: {
      status: sqsHealthy ? 'connected' : 'disconnected',
    },
  });
});

export default router;
