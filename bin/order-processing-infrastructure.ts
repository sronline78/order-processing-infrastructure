#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/stacks/network-stack';
import { MessagingStack } from '../lib/stacks/messaging-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { ApplicationStack } from '../lib/stacks/application-stack';
import { WafStack } from '../lib/stacks/waf-stack';
import { getConfig } from '../lib/config/environment-config';

const app = new cdk.App();

// Get environment configuration
const environment = process.env.ENVIRONMENT || 'dev';
const config = getConfig(environment);

// Create stacks
const networkStack = new NetworkStack(app, `${environment}-NetworkStack`, {
  env: config.env,
  vpcConfig: config.vpcConfig,
  monitoringConfig: config.monitoringConfig,
});

const messagingStack = new MessagingStack(app, `${environment}-MessagingStack`, {
  env: config.env,
  messagingConfig: config.messagingConfig,
});

const databaseStack = new DatabaseStack(app, `${environment}-DatabaseStack`, {
  env: config.env,
  vpc: networkStack.vpc,
  databaseConfig: config.databaseConfig,
  monitoringConfig: config.monitoringConfig,
});

const applicationStack = new ApplicationStack(app, `${environment}-ApplicationStack`, {
  env: config.env,
  vpc: networkStack.vpc,
  database: databaseStack.cluster,
  databaseSecurityGroup: databaseStack.securityGroup,
  queue: messagingStack.queue,
  ecsConfig: config.ecsConfig,
  monitoringConfig: config.monitoringConfig,
});

// Create WAF stack to protect the ALB
const wafStack = new WafStack(app, `${environment}-WafStack`, {
  env: config.env,
  alb: applicationStack.alb,
  wafConfig: config.wafConfig,
});

// Add dependencies
databaseStack.addDependency(networkStack);
applicationStack.addDependency(networkStack);
applicationStack.addDependency(databaseStack);
applicationStack.addDependency(messagingStack);
wafStack.addDependency(applicationStack);

// Apply tags to all stacks
Object.entries(config.tags).forEach(([key, value]) => {
  cdk.Tags.of(networkStack).add(key, value);
  cdk.Tags.of(messagingStack).add(key, value);
  cdk.Tags.of(databaseStack).add(key, value);
  cdk.Tags.of(applicationStack).add(key, value);
});
