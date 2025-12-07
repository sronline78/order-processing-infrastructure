import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface WafConfig {
  enabled: boolean;
  rateLimit: number;
  allowedCountryCodes?: string[];
  enableLogging?: boolean;
}

export interface WafStackProps extends cdk.StackProps {
  alb: elbv2.ApplicationLoadBalancer;
  wafConfig: WafConfig;
}

export class WafStack extends cdk.Stack {
  public readonly webAcl?: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: WafStackProps) {
    super(scope, id, props);

    // Only create WAF resources if enabled
    if (!props.wafConfig.enabled) {
      new cdk.CfnOutput(this, 'WafStatus', {
        value: 'WAF is disabled for this environment',
        description: 'WAF Status',
      });
      return;
    }

    // Create Web ACL with managed rule groups and rate limiting
    this.webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      description: 'WAF Web ACL to protect Application Load Balancer',
      name: `${id}-WebACL`,
      rules: [
        // Rule 1: AWS Managed Rules - Core Rule Set (OWASP Top 10)
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSetMetric',
          },
        },
        // Rule 2: AWS Managed Rules - Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSetMetric',
          },
        },
        // Rule 3: AWS Managed Rules - IP Reputation List
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 3,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesAmazonIpReputationListMetric',
          },
        },
        // Rule 4: Rate Limiting Rule (2000 requests per 5 minutes per IP)
        {
          name: 'RateLimitRule',
          priority: 4,
          statement: {
            rateBasedStatement: {
              limit: props.wafConfig.rateLimit,
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRuleMetric',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${id}-WebACL-Metric`,
      },
    });

    // Associate Web ACL with Application Load Balancer
    new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
      resourceArn: props.alb.loadBalancerArn,
      webAclArn: this.webAcl.attrArn,
    });

    // CloudWatch Metrics and Alarms for WAF

    // 1. Blocked Requests Metric
    const blockedRequestsMetric = new cloudwatch.Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'BlockedRequests',
      dimensionsMap: {
        WebACL: this.webAcl.name || `${id}-WebACL`,
        Region: cdk.Stack.of(this).region,
        Rule: 'ALL',
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const blockedRequestsAlarm = new cloudwatch.Alarm(this, 'BlockedRequestsAlarm', {
      metric: blockedRequestsMetric,
      threshold: 100,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Alert when WAF blocks more than 100 requests in 10 minutes',
      alarmName: `${id}-HighBlockedRequests`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 2. Rate Limit Metric
    const rateLimitMetric = new cloudwatch.Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'BlockedRequests',
      dimensionsMap: {
        WebACL: this.webAcl.name || `${id}-WebACL`,
        Region: cdk.Stack.of(this).region,
        Rule: 'RateLimitRule',
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const rateLimitAlarm = new cloudwatch.Alarm(this, 'RateLimitAlarm', {
      metric: rateLimitMetric,
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Alert when rate limit rule blocks requests',
      alarmName: `${id}-RateLimitTriggered`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 3. Total Allowed Requests Metric
    const allowedRequestsMetric = new cloudwatch.Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'AllowedRequests',
      dimensionsMap: {
        WebACL: this.webAcl.name || `${id}-WebACL`,
        Region: cdk.Stack.of(this).region,
        Rule: 'ALL',
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // CloudWatch Dashboard for WAF Metrics
    const dashboard = new cloudwatch.Dashboard(this, 'WafDashboard', {
      dashboardName: `${id}-WAF-Dashboard`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'WAF Request Metrics',
        left: [blockedRequestsMetric, allowedRequestsMetric],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Rate Limit Blocks',
        left: [rateLimitMetric],
        width: 12,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Blocked Requests (Last 5 min)',
        metrics: [blockedRequestsMetric],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Allowed Requests (Last 5 min)',
        metrics: [allowedRequestsMetric],
        width: 6,
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'WebACLId', {
      value: this.webAcl.attrId,
      description: 'WAF Web ACL ID',
      exportName: `${id}-WebACLId`,
    });

    new cdk.CfnOutput(this, 'WebACLArn', {
      value: this.webAcl.attrArn,
      description: 'WAF Web ACL ARN',
      exportName: `${id}-WebACLArn`,
    });

    new cdk.CfnOutput(this, 'WafStatus', {
      value: 'WAF is enabled and protecting the ALB',
      description: 'WAF Status',
    });

    new cdk.CfnOutput(this, 'WafDashboardURL', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${
        cdk.Stack.of(this).region
      }#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL for WAF Metrics',
    });

    new cdk.CfnOutput(this, 'RateLimitConfig', {
      value: `${props.wafConfig.rateLimit} requests per 5 minutes`,
      description: 'Rate Limit Configuration',
    });
  }
}
