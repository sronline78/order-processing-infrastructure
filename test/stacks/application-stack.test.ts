import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as rds from 'aws-cdk-lib/aws-rds';
import { ApplicationStack } from '../../lib/stacks/application-stack';

describe('ApplicationStack', () => {
  let app: App;
  let stack: ApplicationStack;
  let template: Template;

  beforeEach(() => {
    app = new App();

    const testEnv = { account: '123456789012', region: 'us-east-1' };

    // Create infrastructure stack for shared resources
    const infraStack = new Stack(app, 'InfraStack', { env: testEnv });
    const vpc = new ec2.Vpc(infraStack, 'TestVpc', { maxAzs: 3 });

    // Create minimal database and security group for testing
    const databaseSecurityGroup = new ec2.SecurityGroup(infraStack, 'TestDbSg', { vpc });
    const database = new rds.DatabaseCluster(infraStack, 'TestDatabase', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_8,
      }),
      writer: rds.ClusterInstance.serverlessV2('writer'),
      vpc,
      securityGroups: [databaseSecurityGroup],
    });

    const queue = sqs.Queue.fromQueueArn(infraStack, 'TestQueue', 'arn:aws:sqs:us-east-1:123456789012:test-queue');

    stack = new ApplicationStack(app, 'TestApplicationStack', {
      env: testEnv,
      vpc,
      database,
      databaseSecurityGroup,
      queue,
      ecsConfig: {
        backendDesiredCount: 2,
        frontendDesiredCount: 2,
        backendCpu: 512,
        backendMemory: 1024,
        backendMinCapacity: 1,
        backendMaxCapacity: 10,
        frontendCpu: 256,
        frontendMemory: 512,
      },
      monitoringConfig: {
        logRetentionDays: 7,
      },
    });

    template = Template.fromStack(stack);
  });

  describe('ECS Cluster', () => {
    test('creates ECS cluster', () => {
      template.hasResourceProperties('AWS::ECS::Cluster', {
        ClusterName: 'order-processing-cluster',
      });
    });

    test('enables Fargate capacity providers', () => {
      template.hasResourceProperties('AWS::ECS::ClusterCapacityProviderAssociations', {
        CapacityProviders: Match.arrayWith(['FARGATE', 'FARGATE_SPOT']),
      });
    });
  });

  describe('Application Load Balancer', () => {
    test('creates ALB', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
        Name: 'order-processing-alb',
        Scheme: 'internet-facing',
        Type: 'application',
      });
    });

    test('creates HTTP listener on port 80', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
        Port: 80,
        Protocol: 'HTTP',
      });
    });

    test('creates target group for backend', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        Port: 3000,
        Protocol: 'HTTP',
        TargetType: 'ip',
        HealthCheckPath: '/health',
      });
    });

    test('creates target group for frontend', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        Port: 80,
        Protocol: 'HTTP',
        TargetType: 'ip',
        HealthCheckPath: '/',
      });
    });
  });

  describe('Backend ECS Service', () => {
    test('creates Fargate task definition', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        RequiresCompatibilities: ['FARGATE'],
        NetworkMode: 'awsvpc',
        Cpu: '512',
        Memory: '1024',
      });
    });

    test('task definition has backend container', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: 'Backend',
            Essential: true,
            PortMappings: Match.arrayWith([
              Match.objectLike({
                ContainerPort: 3000,
                Protocol: 'tcp',
              }),
            ]),
          }),
        ]),
      });
    });

    test('creates ECS service with desired count', () => {
      template.hasResourceProperties('AWS::ECS::Service', {
        ServiceName: 'order-processor-backend',
        DesiredCount: 2,
        LaunchType: 'FARGATE',
      });
    });

    test('service has circuit breaker enabled', () => {
      template.hasResourceProperties('AWS::ECS::Service', {
        DeploymentConfiguration: {
          DeploymentCircuitBreaker: {
            Enable: true,
            Rollback: true,
          },
        },
      });
    });
  });

  describe('Frontend ECS Service', () => {
    test('creates frontend task definition', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Cpu: '256',
        Memory: '512',
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: 'Frontend',
            Essential: true,
          }),
        ]),
      });
    });

    test('creates frontend service', () => {
      template.hasResourceProperties('AWS::ECS::Service', {
        ServiceName: 'order-processor-frontend',
        DesiredCount: 2,
      });
    });
  });

  describe('Auto Scaling', () => {
    test('creates auto scaling target for backend', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 1,
        MaxCapacity: 10,
        ScalableDimension: 'ecs:service:DesiredCount',
      });
    });

    test('creates CPU scaling policy', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
        PolicyType: 'TargetTrackingScaling',
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          TargetValue: 70,
        },
      });
    });

    test('creates memory scaling policy', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageMemoryUtilization',
          },
          TargetValue: 80,
        },
      });
    });
  });

  describe('IAM Roles and Permissions', () => {
    test('creates task execution role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: 'ecs-tasks.amazonaws.com',
              },
            }),
          ]),
        },
      });
    });

    test('backend task role has SQS permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                'sqs:ReceiveMessage',
                'sqs:ChangeMessageVisibility',
                'sqs:GetQueueUrl',
                'sqs:DeleteMessage',
                'sqs:GetQueueAttributes',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('backend task role has Secrets Manager permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['secretsmanager:GetSecretValue']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  describe('Stack Outputs', () => {
    test('exports ALB URL', () => {
      template.hasOutput('LoadBalancerURL', {});
    });

    test('exports ALB DNS', () => {
      template.hasOutput('LoadBalancerDNS', {});
    });

    test('exports backend service name', () => {
      template.hasOutput('BackendServiceName', {});
    });

    test('exports frontend service name', () => {
      template.hasOutput('FrontendServiceName', {});
    });
  });

  describe('Resource Count', () => {
    test('creates 2 ECS services', () => {
      template.resourceCountIs('AWS::ECS::Service', 2);
    });

    test('creates 2 target groups', () => {
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 2);
    });

    test('creates 1 load balancer', () => {
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    });
  });
});
