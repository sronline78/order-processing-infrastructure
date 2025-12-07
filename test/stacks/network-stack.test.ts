import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NetworkStack } from '../../lib/stacks/network-stack';

describe('NetworkStack', () => {
  let app: App;
  let stack: NetworkStack;
  let template: Template;

  beforeEach(() => {
    app = new App();
    stack = new NetworkStack(app, 'TestNetworkStack', {
      env: { account: '123456789012', region: 'us-east-1' },
      vpcConfig: {
        maxAzs: 3,
        natGateways: 3,
      },
      monitoringConfig: {
        logRetentionDays: logs.RetentionDays.ONE_WEEK,
      },
    });
    template = Template.fromStack(stack);
  });

  describe('VPC Configuration', () => {
    test('creates VPC with correct CIDR block', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.0.0.0/16',
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test('creates VPC with 3 availability zones', () => {
      const vpcs = template.findResources('AWS::EC2::VPC');
      expect(Object.keys(vpcs).length).toBe(1);
    });

    test('creates public subnets', () => {
      template.resourceCountIs('AWS::EC2::Subnet', 6); // 3 public + 3 private
    });

    test('creates NAT gateways for private subnets', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 3);
    });

    test('creates internet gateway', () => {
      template.resourceCountIs('AWS::EC2::InternetGateway', 1);
    });
  });

  describe('VPC Flow Logs', () => {
    test('enables VPC flow logs', () => {
      template.resourceCountIs('AWS::EC2::FlowLog', 1);
    });

    test('creates CloudWatch log group for flow logs', () => {
      template.resourceCountIs('AWS::Logs::LogGroup', 1);
    });
  });

  describe('Stack Outputs', () => {
    test('exports VPC ID', () => {
      template.hasOutput('VpcId', {});
    });

    test('exports VPC CIDR', () => {
      template.hasOutput('VpcCidr', {});
    });
  });
});
