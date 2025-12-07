import { Router, Request, Response } from 'express';
import { SQSClient, SendMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { getOrders, getOrderById, getOrderStats, getTotalOrderCount } from '../models/order';
import { randomUUID } from 'crypto';

const router = Router();
const sqsClient = new SQSClient({});

/**
 * GET /api/orders
 * Get paginated list of orders
 * Query params: page (default: 1), limit (default: 50)
 */
router.get('/api/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    // Validate pagination parameters
    if (page < 1) {
      res.status(400).json({ error: 'Page must be greater than 0' });
      return;
    }

    if (limit < 1 || limit > 100) {
      res.status(400).json({ error: 'Limit must be between 1 and 100' });
      return;
    }

    const orders = await getOrders(page, limit);
    const totalCount = await getTotalOrderCount();

    res.status(200).json({
      orders,
      total: totalCount,
      page,
      limit,
    });
  } catch (error) {
    console.error('[Orders API] Failed to fetch orders:', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/orders/:orderId
 * Get a single order by ID
 */
router.get('/api/orders/:orderId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;

    const order = await getOrderById(orderId);

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.status(200).json({ data: order });
  } catch (error) {
    console.error('[Orders API] Failed to fetch order:', error);
    res.status(500).json({
      error: 'Failed to fetch order',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/orders
 * Submit a new order to SQS queue (async processing)
 * Returns immediately with order ID
 */
router.post('/api/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { customer_id, items } = req.body;

    // Validate request body
    if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: 'Invalid request body',
        message: 'customer_id and items array are required',
      });
      return;
    }

    // Validate items structure
    for (const item of items) {
      if (!item.product_id || !item.quantity || !item.price) {
        res.status(400).json({
          error: 'Invalid item structure',
          message: 'Each item must have product_id, quantity, and price',
        });
        return;
      }

      if (item.quantity <= 0 || item.price < 0) {
        res.status(400).json({
          error: 'Invalid item values',
          message: 'Quantity must be positive and price must be non-negative',
        });
        return;
      }
    }

    // Calculate total amount
    const total_amount = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.price,
      0
    );

    // Generate order ID
    const order_id = randomUUID();

    // Create order object
    const order = {
      order_id,
      customer_id,
      total_amount: parseFloat(total_amount.toFixed(2)),
      items,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    // Send to SQS queue
    const queueUrl = process.env.QUEUE_URL;

    if (!queueUrl) {
      console.error('[Orders API] QUEUE_URL environment variable not set');
      res.status(500).json({
        error: 'Queue not configured',
        message: 'QUEUE_URL environment variable is not set',
      });
      return;
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(order),
      MessageAttributes: {
        order_id: {
          DataType: 'String',
          StringValue: order_id,
        },
        customer_id: {
          DataType: 'String',
          StringValue: customer_id,
        },
      },
    });

    await sqsClient.send(command);

    console.log(`[Orders API] Order ${order_id} submitted to queue for customer ${customer_id}`);

    // Return immediately with order ID
    res.status(202).json({
      message: 'Order accepted for processing',
      order_id,
      status: 'queued',
      total_amount: order.total_amount,
    });
  } catch (error) {
    console.error('[Orders API] Failed to submit order:', error);
    res.status(500).json({
      error: 'Failed to submit order',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/stats
 * Get order statistics and queue depth
 */
router.get('/api/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Get database statistics
    const stats = await getOrderStats();

    // Get SQS queue depth
    let queueDepth = 0;
    let queueInFlight = 0;

    try {
      const queueUrl = process.env.QUEUE_URL;
      if (queueUrl) {
        const command = new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: [
            'ApproximateNumberOfMessages',
            'ApproximateNumberOfMessagesNotVisible',
          ],
        });

        const response = await sqsClient.send(command);
        queueDepth = parseInt(response.Attributes?.ApproximateNumberOfMessages || '0', 10);
        queueInFlight = parseInt(
          response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0',
          10
        );
      }
    } catch (error) {
      console.error('[Orders API] Failed to get queue depth:', error);
    }

    // Calculate processing rate (orders per hour in last 24h)
    const processing_rate = stats.orders_today > 0 ? Math.round(stats.orders_today / 24 * 10) / 10 : 0;

    res.status(200).json({
      orders_today: stats.orders_today || 0,
      processing_rate,
      queue_depth: queueDepth + queueInFlight,
      total_orders: stats.total_orders || 0,
      orders_by_hour: stats.orders_by_hour || [],
    });
  } catch (error) {
    console.error('[Orders API] Failed to fetch stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
