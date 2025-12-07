import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { MessagingConfig } from '../config/environment-config';

export interface MessagingStackProps extends cdk.StackProps {
  messagingConfig: MessagingConfig;
}

export class MessagingStack extends cdk.Stack {
  public readonly queue: sqs.Queue;
  public readonly dlq: sqs.Queue;
  public readonly orderProducer: lambda.Function;

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props);

    // Dead Letter Queue
    this.dlq = new sqs.Queue(this, 'OrdersDLQ', {
      queueName: 'orders-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Main Orders Queue
    this.queue = new sqs.Queue(this, 'OrdersQueue', {
      queueName: 'orders-queue',
      visibilityTimeout: cdk.Duration.seconds(300),
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: this.dlq,
        maxReceiveCount: 3, // Retry 3 times before DLQ
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Lambda Order Producer
    this.orderProducer = new lambda.Function(this, 'OrderProducer', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/order-producer'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        QUEUE_URL: this.queue.queueUrl,
        MIN_ORDERS: props.messagingConfig.minOrdersPerInvocation.toString(),
        MAX_ORDERS: props.messagingConfig.maxOrdersPerInvocation.toString(),
        ENABLED: props.messagingConfig.producerEnabled.toString(),
      },
    });

    // Grant Lambda permission to send to SQS
    this.queue.grantSendMessages(this.orderProducer);

    // EventBridge rule to trigger Lambda
    const rule = new events.Rule(this, 'ProducerSchedule', {
      schedule: events.Schedule.rate(
        cdk.Duration.minutes(props.messagingConfig.producerIntervalMinutes)
      ),
      enabled: props.messagingConfig.producerEnabled,
    });

    rule.addTarget(new targets.LambdaFunction(this.orderProducer));

    // Outputs
    new cdk.CfnOutput(this, 'QueueUrl', {
      value: this.queue.queueUrl,
      description: 'Orders Queue URL',
      exportName: `${id}-QueueUrl`,
    });

    new cdk.CfnOutput(this, 'QueueArn', {
      value: this.queue.queueArn,
      description: 'Orders Queue ARN',
    });

    new cdk.CfnOutput(this, 'DLQUrl', {
      value: this.dlq.queueUrl,
      description: 'Dead Letter Queue URL',
    });

    new cdk.CfnOutput(this, 'LambdaArn', {
      value: this.orderProducer.functionArn,
      description: 'Order Producer Lambda ARN',
    });
  }
}
