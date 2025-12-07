import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { MessagingStack } from '../../lib/stacks/messaging-stack';

describe('MessagingStack', () => {
  let app: App;
  let stack: MessagingStack;
  let template: Template;

  beforeEach(() => {
    app = new App();
    stack = new MessagingStack(app, 'TestMessagingStack', {
      env: { account: '123456789012', region: 'us-east-1' },
      messagingConfig: {
        producerEnabled: true,
        producerIntervalMinutes: 5,
        minOrdersPerInvocation: 1,
        maxOrdersPerInvocation: 5,
      },
    });
    template = Template.fromStack(stack);
  });

  describe('SQS Queue Configuration', () => {
    test('creates main order queue', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'orders-queue',
        VisibilityTimeout: 300,
        ReceiveMessageWaitTimeSeconds: 20,
      });
    });

    test('enables encryption at rest', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        SqsManagedSseEnabled: true,
      });
    });

    test('creates dead letter queue', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'orders-dlq',
        MessageRetentionPeriod: 1209600,
      });
    });

    test('configures DLQ redrive policy', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        RedrivePolicy: {
          deadLetterTargetArn: Match.anyValue(),
          maxReceiveCount: 3,
        },
      });
    });
  });

  describe('Lambda Function', () => {
    test('creates order producer Lambda', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'python3.11',
        Handler: 'index.handler',
        Timeout: 30,
      });
    });

    test('Lambda has environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            QUEUE_URL: Match.anyValue(),
          },
        },
      });
    });

  });

  describe('IAM Permissions', () => {
    test('Lambda has permission to send messages to SQS', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['sqs:SendMessage']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('Lambda execution role exists', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            }),
          ]),
        },
      });
    });
  });

  describe('Stack Outputs', () => {
    test('exports queue URL', () => {
      template.hasOutput('QueueUrl', {});
    });

    test('exports queue ARN', () => {
      template.hasOutput('QueueArn', {});
    });

    test('exports DLQ URL', () => {
      template.hasOutput('DLQUrl', {});
    });

    test('exports Lambda function ARN', () => {
      template.hasOutput('LambdaArn', {});
    });
  });

  describe('Resource Count', () => {
    test('creates exactly 2 SQS queues', () => {
      template.resourceCountIs('AWS::SQS::Queue', 2);
    });

    test('creates exactly 1 Lambda function', () => {
      template.resourceCountIs('AWS::Lambda::Function', 1);
    });
  });
});
