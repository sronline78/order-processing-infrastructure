import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { insertOrder, updateOrderStatus } from './models/order';
import type { Order } from './models/order';

const sqsClient = new SQSClient({});
let isRunning = false;
let pollingInterval: NodeJS.Timeout | null = null;

/**
 * Process a single SQS message
 */
async function processMessage(message: Message): Promise<void> {
  if (!message.Body) {
    console.warn('[SQS Handler] Received message with empty body');
    return;
  }

  try {
    const order: Order = JSON.parse(message.Body);

    console.log(`[SQS Handler] Processing order: ${order.order_id}`);

    // Validate order structure
    if (!order.order_id || !order.customer_id || !order.items) {
      throw new Error('Invalid order structure');
    }

    // Insert order into database
    await insertOrder(order);

    // Mark order as completed after successful processing
    await updateOrderStatus(order.order_id, 'completed');

    console.log(`[SQS Handler] Successfully processed order: ${order.order_id}`);
  } catch (error) {
    console.error('[SQS Handler] Failed to process message:', error);
    console.error('[SQS Handler] Message body:', message.Body);
    throw error; // Re-throw to prevent message deletion
  }
}

/**
 * Delete a message from the queue after successful processing
 */
async function deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
  try {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });

    await sqsClient.send(command);
    console.log('[SQS Handler] Message deleted from queue');
  } catch (error) {
    console.error('[SQS Handler] Failed to delete message:', error);
  }
}

/**
 * Poll SQS queue for messages
 */
async function pollQueue(): Promise<void> {
  const queueUrl = process.env.QUEUE_URL;

  if (!queueUrl) {
    console.error('[SQS Handler] QUEUE_URL environment variable not set');
    return;
  }

  try {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10, // Batch processing up to 10 messages
      WaitTimeSeconds: 20, // Long polling (20 seconds)
      MessageAttributeNames: ['All'],
    });

    const response = await sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      // No messages available - this is normal with long polling
      return;
    }

    console.log(`[SQS Handler] Received ${response.Messages.length} message(s)`);

    // Process messages sequentially to maintain order
    for (const message of response.Messages) {
      try {
        await processMessage(message);

        // Delete message only if processing was successful
        if (message.ReceiptHandle) {
          await deleteMessage(queueUrl, message.ReceiptHandle);
        }
      } catch (error) {
        // Don't delete message on failure - let it retry
        console.error('[SQS Handler] Message processing failed, leaving in queue for retry');
        console.error('[SQS Handler] Error:', error);
        // Continue processing other messages
      }
    }
  } catch (error) {
    console.error('[SQS Handler] Failed to poll queue:', error);
    // Don't throw - continue polling on next interval
  }
}

/**
 * Continuous polling loop
 */
async function continuousPolling(): Promise<void> {
  if (!isRunning) {
    return;
  }

  try {
    await pollQueue();
  } catch (error) {
    console.error('[SQS Handler] Polling error:', error);
  }

  // Schedule next poll immediately (long polling provides natural delay)
  if (isRunning) {
    setImmediate(continuousPolling);
  }
}

/**
 * Start the SQS worker
 */
export async function startSqsWorker(): Promise<void> {
  const queueUrl = process.env.QUEUE_URL;

  if (!queueUrl) {
    console.error('[SQS Handler] QUEUE_URL not set, worker will not start');
    return;
  }

  if (isRunning) {
    console.warn('[SQS Handler] Worker already running');
    return;
  }

  isRunning = true;
  console.log('[SQS Handler] Starting SQS worker...');
  console.log(`[SQS Handler] Queue URL: ${queueUrl}`);
  console.log('[SQS Handler] Polling configuration: max 10 messages, 20s long polling');

  // Start continuous polling
  setImmediate(continuousPolling);

  console.log('[SQS Handler] Worker started successfully');
}

/**
 * Stop the SQS worker
 */
export async function stopSqsWorker(): Promise<void> {
  console.log('[SQS Handler] Stopping SQS worker...');
  isRunning = false;

  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  console.log('[SQS Handler] Worker stopped');
}

/**
 * Check if worker is running
 */
export function isWorkerRunning(): boolean {
  return isRunning;
}
