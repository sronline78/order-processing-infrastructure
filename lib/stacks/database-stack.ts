import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { DatabaseConfig, MonitoringConfig } from '../config/environment-config';

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  databaseConfig: DatabaseConfig;
  monitoringConfig: MonitoringConfig;
}

export class DatabaseStack extends cdk.Stack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Security Group for Aurora
    this.securityGroup = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Aurora Serverless v2 PostgreSQL',
      allowAllOutbound: true,
    });

    // Allow traffic from private subnets (where ECS tasks run)
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from VPC'
    );

    // Aurora Serverless v2 PostgreSQL Cluster
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_8,
      }),
      serverlessV2MinCapacity: props.databaseConfig.minCapacity,
      serverlessV2MaxCapacity: props.databaseConfig.maxCapacity,
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      readers: [
        rds.ClusterInstance.serverlessV2('Reader1', { scaleWithWriter: true }),
      ],
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.securityGroup],
      credentials: rds.Credentials.fromGeneratedSecret('postgres'),
      defaultDatabaseName: 'orders',
      storageEncrypted: true, // Enable encryption at rest
      backup: {
        retention: cdk.Duration.days(props.databaseConfig.backupRetention),
      },
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: props.monitoringConfig.logRetentionDays,
      deletionProtection: props.databaseConfig.deletionProtection,
      removalPolicy: props.databaseConfig.deletionProtection
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora Cluster Endpoint',
      exportName: `${id}-ClusterEndpoint`,
    });

    new cdk.CfnOutput(this, 'ClusterReadEndpoint', {
      value: this.cluster.clusterReadEndpoint.hostname,
      description: 'Aurora Cluster Read Endpoint',
    });

    new cdk.CfnOutput(this, 'SecretArn', {
      value: this.cluster.secret!.secretArn,
      description: 'Aurora Credentials Secret ARN',
      exportName: `${id}-SecretArn`,
    });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: 'orders',
      description: 'Default Database Name',
    });
  }
}
