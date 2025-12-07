import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EcsConfig, MonitoringConfig } from '../config/environment-config';

export interface ApplicationStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  database: rds.DatabaseCluster;
  databaseSecurityGroup: ec2.ISecurityGroup;
  queue: sqs.IQueue;
  ecsConfig: EcsConfig;
  monitoringConfig: MonitoringConfig;
}

export class ApplicationStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly backendService: ecs.FargateService;
  public readonly frontendService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'OrderProcessingCluster', {
      vpc: props.vpc,
      clusterName: 'order-processing-cluster',
      enableFargateCapacityProviders: true,
    });

    // ECR Repositories (created manually or via CLI)
    const backendRepo = ecr.Repository.fromRepositoryName(
      this,
      'BackendRepo',
      'order-processor-backend'
    );

    const frontendRepo = ecr.Repository.fromRepositoryName(
      this,
      'FrontendRepo',
      'order-processor-frontend'
    );

    // Security Groups
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from anywhere'
    );

    const backendSecurityGroup = new ec2.SecurityGroup(this, 'BackendSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Backend ECS tasks',
      allowAllOutbound: true,
    });

    const frontendSecurityGroup = new ec2.SecurityGroup(this, 'FrontendSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Frontend ECS tasks',
      allowAllOutbound: true,
    });

    // Allow ALB to reach backend and frontend
    backendSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow ALB to backend'
    );

    frontendSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(80),
      'Allow ALB to frontend'
    );

    // Backend Task Definition
    const backendTaskDef = new ecs.FargateTaskDefinition(this, 'BackendTaskDef', {
      memoryLimitMiB: props.ecsConfig.backendMemory,
      cpu: props.ecsConfig.backendCpu,
    });

    const backendContainer = backendTaskDef.addContainer('Backend', {
      image: ecs.ContainerImage.fromEcrRepository(backendRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'backend',
        logRetention: props.monitoringConfig.logRetentionDays,
      }),
      environment: {
        QUEUE_URL: props.queue.queueUrl,
        DB_SECRET_ARN: props.database.secret!.secretArn,
        NODE_ENV: 'production',
      },
      portMappings: [{ containerPort: 3000 }],
    });

    // Grant permissions to backend
    props.queue.grantConsumeMessages(backendTaskDef.taskRole);
    props.queue.grantSendMessages(backendTaskDef.taskRole); // For POST /api/orders
    props.database.secret!.grantRead(backendTaskDef.taskRole);

    // Backend Service
    this.backendService = new ecs.FargateService(this, 'BackendService', {
      cluster,
      taskDefinition: backendTaskDef,
      desiredCount: props.ecsConfig.backendDesiredCount,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [backendSecurityGroup],
      serviceName: 'order-processor-backend',
      circuitBreaker: {
        rollback: true,
      },
    });

    // Backend Auto-scaling
    const backendScaling = this.backendService.autoScaleTaskCount({
      minCapacity: props.ecsConfig.backendMinCapacity,
      maxCapacity: props.ecsConfig.backendMaxCapacity,
    });

    backendScaling.scaleOnCpuUtilization('BackendCpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    backendScaling.scaleOnMemoryUtilization('BackendMemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Frontend Task Definition
    const frontendTaskDef = new ecs.FargateTaskDefinition(this, 'FrontendTaskDef', {
      memoryLimitMiB: props.ecsConfig.frontendMemory,
      cpu: props.ecsConfig.frontendCpu,
    });

    const frontendContainer = frontendTaskDef.addContainer('Frontend', {
      image: ecs.ContainerImage.fromEcrRepository(frontendRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'frontend',
        logRetention: props.monitoringConfig.logRetentionDays,
      }),
      portMappings: [{ containerPort: 80 }],
    });

    // Frontend Service
    this.frontendService = new ecs.FargateService(this, 'FrontendService', {
      cluster,
      taskDefinition: frontendTaskDef,
      desiredCount: props.ecsConfig.frontendDesiredCount,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [frontendSecurityGroup],
      serviceName: 'order-processor-frontend',
      circuitBreaker: {
        rollback: true,
      },
    });

    // Application Load Balancer
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: albSecurityGroup,
      loadBalancerName: 'order-processing-alb',
    });

    // HTTP Listener with Frontend as default target
    // PRODUCTION NOTE: Should use HTTPS with ACM certificate and redirect HTTP to HTTPS
    // For demo/test purposes using HTTP only to avoid domain/certificate requirements
    const listener = this.alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [
        new elbv2.ApplicationTargetGroup(this, 'FrontendTargetGroup', {
          vpc: props.vpc,
          port: 80,
          protocol: elbv2.ApplicationProtocol.HTTP,
          targets: [this.frontendService],
          healthCheck: {
            path: '/',
            interval: cdk.Duration.seconds(30),
            timeout: cdk.Duration.seconds(5),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 3,
          },
          deregistrationDelay: cdk.Duration.seconds(30),
        }),
      ],
    });

    // Backend Target Group (for /api/* and /api/health with higher priority)
    listener.addTargets('BackendTarget', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.backendService],
      healthCheck: {
        path: '/api/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/api/*', '/api/health']),
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS',
      exportName: `${id}-LoadBalancerDNS`,
    });

    new cdk.CfnOutput(this, 'LoadBalancerURL', {
      value: `http://${this.alb.loadBalancerDnsName}`,
      description: 'Application URL',
    });

    new cdk.CfnOutput(this, 'BackendServiceName', {
      value: this.backendService.serviceName,
      description: 'Backend ECS Service Name',
    });

    new cdk.CfnOutput(this, 'FrontendServiceName', {
      value: this.frontendService.serviceName,
      description: 'Frontend ECS Service Name',
    });
  }
}
