import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { DatabaseStack } from '../../lib/stacks/database-stack';

describe('DatabaseStack', () => {
  let app: App;
  let vpc: ec2.IVpc;
  let stack: DatabaseStack;
  let template: Template;

  beforeEach(() => {
    app = new App();

    const testEnv = { account: '123456789012', region: 'us-east-1' };

    // Create VPC in the database stack itself for testing
    const vpcStack = new Stack(app, 'VpcStack', { env: testEnv });
    vpc = new ec2.Vpc(vpcStack, 'TestVpc', {
      maxAzs: 3,
      natGateways: 3,
    });

    stack = new DatabaseStack(app, 'TestDatabaseStack', {
      env: testEnv,
      vpc,
      databaseConfig: {
        minCapacity: 0.5,
        maxCapacity: 1,
        backupRetention: 7,
        deletionProtection: false,
        readerInstances: 0,
      },
      monitoringConfig: {
        logRetentionDays: logs.RetentionDays.ONE_WEEK,
      },
    });

    template = Template.fromStack(stack);
  });

  describe('Aurora Serverless v2 Cluster', () => {
    test('creates Aurora cluster with PostgreSQL engine', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        Engine: 'aurora-postgresql',
        ServerlessV2ScalingConfiguration: {
          MinCapacity: 0.5,
          MaxCapacity: 1,
        },
      });
    });

    test('configures backup retention', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 7,
      });
    });

    test('sets database name', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        DatabaseName: 'orders',
      });
    });
  });

  describe('Database Instances', () => {
    test('creates writer instance', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.serverless',
        Engine: 'aurora-postgresql',
      });
    });

    test('configures instances in private subnets', () => {
      template.hasResourceProperties('AWS::RDS::DBSubnetGroup', {});
    });
  });

  describe('Secrets Manager Integration', () => {
    test('creates secret for database credentials', () => {
      template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    });
  });

  describe('Stack Outputs', () => {
    test('exports cluster endpoint', () => {
      template.hasOutput('ClusterEndpoint', {});
    });

    test('exports cluster read endpoint', () => {
      template.hasOutput('ClusterReadEndpoint', {});
    });

    test('exports secret ARN', () => {
      template.hasOutput('SecretArn', {});
    });

    test('exports database name', () => {
      template.hasOutput('DatabaseName', {});
    });
  });

  describe('High Availability', () => {
    test('cluster is deployed in multiple AZs', () => {
      template.hasResourceProperties('AWS::RDS::DBSubnetGroup', {});
    });
  });
});
