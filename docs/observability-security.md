# Observability and Security Plan

## Executive Summary

This document outlines the comprehensive observability and security strategy for the Order Processing Infrastructure. The plan emphasizes **defense in depth**, **continuous monitoring**, and **proactive threat detection** while maintaining operational visibility across all system components.

---

## Table of Contents

1. [Logging Strategy](#logging-strategy)
2. [Metrics and Monitoring](#metrics-and-monitoring)
3. [Alerting Strategy](#alerting-strategy)
4. [Security Architecture](#security-architecture)
5. [Threat Detection](#threat-detection)
6. [Compliance and Audit](#compliance-and-audit)
7. [Incident Response](#incident-response)
8. [Cost Optimization](#cost-optimization)

---

## Logging Strategy

### Centralized Logging Architecture

All logs are aggregated in **Amazon CloudWatch Logs** with structured log groups for easy querying and analysis.

#### Log Group Naming Convention

```
/aws/{service}/{environment}/{resource}
```

Examples:
- `/aws/ecs/dev/backend` - Backend container logs
- `/aws/ecs/dev/frontend` - Frontend container logs
- `/aws/lambda/dev/order-producer` - Lambda function logs
- `/aws/rds/cluster/dev-auroracluster/postgresql` - Aurora PostgreSQL logs
- `/aws/vpc/flowlogs/dev` - VPC Flow Logs

#### Log Retention Policy

| Environment | Retention Period | Rationale |
|-------------|------------------|-----------|
| Development | 7 days           | Cost optimization, rapid iteration |
| Staging     | 30 days          | Extended testing period |
| Production  | 90 days          | Compliance, audit trail, debugging |

#### Log Sources

##### 1. Application Logs (ECS Fargate)

**Backend Service:**
```json
{
  "timestamp": "2025-12-06T06:42:00Z",
  "level": "INFO",
  "service": "order-processor-backend",
  "message": "Processed order",
  "orderId": "order-123",
  "customerId": "customer-456",
  "processingTime": 245,
  "sqsMessageId": "abc-def-123"
}
```

**Logging Configuration:**
- JSON structured logging for easy parsing
- Correlation IDs for request tracing
- AWS X-Ray integration for distributed tracing

**Frontend Service:**
- nginx access logs
- Error logs for failed requests
- Client IP addresses (anonymized for GDPR)

##### 2. Database Logs (Aurora PostgreSQL)

**Enabled Log Types:**
- `postgresql` - Query logs, errors, slow queries

**Slow Query Threshold:** 1000ms

**Log Configuration:**
```sql
ALTER DATABASE orders SET log_min_duration_statement = 1000;
ALTER DATABASE orders SET log_connections = 'on';
ALTER DATABASE orders SET log_disconnections = 'on';
```

##### 3. VPC Flow Logs

**Purpose:** Network traffic analysis, security investigation

**Format:**
```
${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${packets} ${bytes} ${start} ${end} ${action} ${log-status}
```

**Retention:** 7 days (dev), 90 days (prod)

**Delivery:** CloudWatch Logs (real-time analysis)

##### 4. Lambda Logs

**Order Producer Function:**
- Invocation count
- Orders generated per execution
- SQS send success/failure
- Execution duration

##### 5. Load Balancer Access Logs

**ALB Access Logs:**
- Stored in S3 bucket: `order-processing-alb-logs-{account-id}`
- Lifecycle policy: Delete after 30 days
- Contains: Client IP, request path, response code, latency

---

## Metrics and Monitoring

### CloudWatch Metrics Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  Order Processing System - Dev Environment                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Application Load Balancer                                   │
│  ├─ Request Count (sum): 1,234 req/min                       │
│  ├─ Target Response Time (avg): 125ms                        │
│  ├─ Unhealthy Hosts (max): 0                                 │
│  └─ 4XX/5XX Errors (sum): 12 / 2                             │
│                                                               │
│  ECS Services                                                 │
│  ├─ Backend Tasks: 2/2 running                               │
│  │   ├─ CPU Utilization: 35%                                 │
│  │   └─ Memory Utilization: 52%                              │
│  └─ Frontend Tasks: 2/2 running                              │
│      ├─ CPU Utilization: 18%                                 │
│      └─ Memory Utilization: 28%                              │
│                                                               │
│  Aurora Serverless v2                                         │
│  ├─ ACU Utilization: 0.8 / 2.0                               │
│  ├─ Database Connections: 24                                 │
│  ├─ CPU Utilization: 22%                                     │
│  └─ Read/Write Latency: 12ms / 18ms                          │
│                                                               │
│  SQS Queue                                                    │
│  ├─ Messages Visible: 5                                      │
│  ├─ Messages In Flight: 2                                    │
│  ├─ Age of Oldest Message: 15s                               │
│  └─ DLQ Messages: 0                                           │
│                                                               │
│  Lambda Function (Order Producer)                            │
│  ├─ Invocations (5min): 1                                    │
│  ├─ Duration (avg): 3,245ms                                  │
│  ├─ Errors: 0                                                 │
│  └─ Throttles: 0                                              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Metrics by Component

#### Application Load Balancer

| Metric                     | Threshold      | Alert |
|----------------------------|----------------|-------|
| UnhealthyHostCount         | > 0            | P1    |
| TargetResponseTime (p99)   | > 2000ms       | P2    |
| HTTPCode_Target_5XX_Count  | > 10/5min      | P2    |
| HTTPCode_Target_4XX_Count  | > 50/5min      | P3    |
| RequestCount               | < 1/5min (prod)| P3    |

#### ECS Services

| Metric                | Threshold | Alert | Action |
|-----------------------|-----------|-------|--------|
| CPUUtilization        | > 80%     | P2    | Auto-scale up |
| MemoryUtilization     | > 85%     | P2    | Auto-scale up |
| Running Tasks         | < Desired | P1    | Investigate |
| Task Stop Reason      | Any       | P2    | Log analysis |

#### Aurora Serverless v2

| Metric                | Threshold    | Alert |
|-----------------------|--------------|-------|
| CPUUtilization        | > 80%        | P2    |
| DatabaseConnections   | > 80% max    | P2    |
| FreeableMemory        | < 512 MB     | P3    |
| ReadLatency           | > 100ms      | P3    |
| WriteLatency          | > 100ms      | P3    |
| ServerlessDatabaseCapacity | > 1.8 ACU | P3  |

#### SQS Queue

| Metric                              | Threshold  | Alert | Meaning |
|-------------------------------------|------------|-------|---------|
| ApproximateAgeOfOldestMessage       | > 300s     | P2    | Processing lag |
| ApproximateNumberOfMessagesVisible  | > 100      | P3    | Backlog growing |
| NumberOfMessagesSent                | 0 (30min)  | P3    | Producer failure |
| ApproximateNumberOfMessagesInDLQ    | > 0        | P1    | Repeated failures |

### Custom Application Metrics

**Using CloudWatch Embedded Metric Format (EMF):**

```typescript
// Backend application metrics
const metrics = {
  _aws: {
    Timestamp: Date.now(),
    CloudWatchMetrics: [{
      Namespace: 'OrderProcessing/Application',
      Dimensions: [['Environment', 'Service']],
      Metrics: [
        { Name: 'OrdersProcessed', Unit: 'Count' },
        { Name: 'OrderProcessingDuration', Unit: 'Milliseconds' },
        { Name: 'DatabaseQueryDuration', Unit: 'Milliseconds' },
        { Name: 'SQSPollDuration', Unit: 'Milliseconds' },
      ]
    }]
  },
  Environment: 'dev',
  Service: 'backend',
  OrdersProcessed: 1,
  OrderProcessingDuration: 245,
  DatabaseQueryDuration: 42,
  SQSPollDuration: 15,
  OrderId: 'order-123',
  CustomerId: 'customer-456'
};

console.log(JSON.stringify(metrics));
```

**Available Custom Metrics:**
- `OrdersProcessed` - Counter, total orders processed
- `OrderProcessingDuration` - Histogram, time to process order (ms)
- `DatabaseQueryDuration` - Histogram, DB query time (ms)
- `SQSPollDuration` - Histogram, SQS long polling time (ms)
- `APIRequestDuration` - Histogram, API endpoint response time (ms)

---

## Alerting Strategy

### SNS Topics

#### 1. Infrastructure Alerts (`order-processing-infrastructure-alerts`)

**Subscribers:**
- Email: `devops-team@example.com`
- Slack: `#infrastructure-alerts`
- PagerDuty: Production only

**Priority Levels:**
- **P1 (Critical)**: Immediate action required, service down
- **P2 (High)**: Degraded performance, potential outage
- **P3 (Warning)**: Approaching limits, proactive action needed

#### 2. Security Alerts (`order-processing-security-alerts`)

**Subscribers:**
- Email: `security-team@example.com`
- Slack: `#security-alerts`
- SIEM: Splunk/DataDog integration

**Filtered Events:**
- HIGH/CRITICAL severity only
- Source: Security Hub, GuardDuty
- EventBridge rule filters non-actionable findings

### CloudWatch Alarms Configuration

#### Example: Backend Service CPU Alarm

```typescript
new cloudwatch.Alarm(this, 'BackendCPUAlarm', {
  metric: backendService.metricCpuUtilization(),
  threshold: 80,
  evaluationPeriods: 2,
  datapointsToAlarm: 2,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  alarmDescription: 'Backend service CPU > 80% for 2 consecutive periods',
  alarmName: 'dev-backend-cpu-high',
  actionsEnabled: true,
});

alarm.addAlarmAction(new cloudwatch_actions.SnsAction(infrastructureAlertsTopic));
```

#### Critical Alarms (P1)

| Alarm Name                | Metric                     | Threshold | Duration |
|---------------------------|----------------------------|-----------|----------|
| ALB-No-Healthy-Targets    | UnhealthyHostCount         | >= 1      | 1 min    |
| Backend-All-Tasks-Down    | RunningTaskCount           | = 0       | 1 min    |
| Frontend-All-Tasks-Down   | RunningTaskCount           | = 0       | 1 min    |
| Database-Unavailable      | DatabaseConnections        | = 0       | 2 min    |
| DLQ-Messages-Detected     | ApproximateNumberOfMessages| > 0       | 1 min    |

#### High Priority Alarms (P2)

| Alarm Name                | Metric                     | Threshold | Duration |
|---------------------------|----------------------------|-----------|----------|
| ALB-High-Latency          | TargetResponseTime (p99)   | > 2000ms  | 5 min    |
| Backend-High-CPU          | CPUUtilization             | > 80%     | 5 min    |
| Backend-High-Memory       | MemoryUtilization          | > 85%     | 5 min    |
| Database-High-CPU         | CPUUtilization             | > 80%     | 5 min    |
| SQS-High-Age              | ApproximateAgeOfOldestMsg  | > 300s    | 5 min    |
| ALB-5XX-Errors            | HTTPCode_Target_5XX_Count  | > 10      | 5 min    |

### Alert Routing Logic

```
┌─────────────────┐
│  CloudWatch     │
│  Alarm          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SNS Topic      │
│  (Infrastructure)│
└────────┬────────┘
         │
         ├──────────────────────────────────────┐
         │                                      │
         ▼                                      ▼
┌─────────────────┐                   ┌─────────────────┐
│  Email          │                   │  Slack Channel  │
│  (All Alerts)   │                   │  (Formatted)    │
└─────────────────┘                   └─────────────────┘
         │                                      │
         │ (P1 only in prod)                   │
         ▼                                      ▼
┌─────────────────┐                   ┌─────────────────┐
│  PagerDuty      │                   │  Lambda         │
│  (Oncall)       │                   │  (Auto-remediate)│
└─────────────────┘                   └─────────────────┘
```

---

## Security Architecture

### Defense in Depth Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 7: Application Security                              │
│  - Input validation, SQL injection prevention               │
│  - CORS policies, Content Security Policy                   │
│  - Rate limiting (future: AWS WAF)                           │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 6: Authentication & Authorization                     │
│  - IAM roles and policies (least privilege)                 │
│  - Task roles for ECS (scoped permissions)                  │
│  - Secrets Manager for credentials                          │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Network Segmentation                               │
│  - Private subnets for compute and database                 │
│  - Security groups (deny by default)                        │
│  - NACLs for additional defense                             │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Data Encryption                                    │
│  - TLS 1.2+ for all connections                             │
│  - At-rest encryption (KMS for Aurora, SSE for SQS/S3)      │
│  - Secrets Manager encryption                               │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Vulnerability Management                           │
│  - ECR image scanning (Inspector v2)                        │
│  - OS patching (Fargate auto-updates base images)           │
│  - Dependency scanning (npm audit in CI/CD)                 │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Threat Detection                                   │
│  - GuardDuty (behavioral threat detection)                  │
│  - Security Hub (CSPM - compliance scanning)                │
│  - VPC Flow Logs (network traffic analysis)                 │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Audit & Compliance                                 │
│  - CloudTrail (all API calls logged)                        │
│  - AWS Config (resource change tracking)                    │
│  - Compliance frameworks (NIST, CIS benchmarks)             │
└─────────────────────────────────────────────────────────────┘
```

### Network Security

#### Security Group Architecture

**ALB Security Group:**
```
Inbound:
  - Port 80 (HTTP) from 0.0.0.0/0
  - (Future: Port 443 HTTPS from 0.0.0.0/0)

Outbound:
  - All traffic (needed to reach backend/frontend)
```

**Backend Security Group:**
```
Inbound:
  - Port 3000 from ALB Security Group only

Outbound:
  - Port 5432 to Database Security Group
  - Port 443 to 0.0.0.0/0 (AWS APIs: Secrets Manager, SQS, S3)
```

**Frontend Security Group:**
```
Inbound:
  - Port 80 from ALB Security Group only

Outbound:
  - Port 443 to 0.0.0.0/0 (CDN, external resources)
```

**Database Security Group:**
```
Inbound:
  - Port 5432 from VPC CIDR block (10.0.0.0/16)

Outbound:
  - None required (database doesn't initiate connections)
```

#### Private Subnet Architecture

```
┌────────────────────────────────────────────────────────┐
│  Public Subnet (ALB only)                              │
│  10.0.0.0/24, 10.0.1.0/24, 10.0.2.0/24                 │
│  ├─ Internet Gateway (ingress/egress)                  │
│  └─ Application Load Balancer                          │
└────────────────────────────────────────────────────────┘
                       ▼
┌────────────────────────────────────────────────────────┐
│  Private Subnet (ECS + Aurora)                         │
│  10.0.3.0/24, 10.0.4.0/24, 10.0.5.0/24                 │
│  ├─ NAT Gateway (egress only for updates)              │
│  ├─ ECS Fargate Tasks (backend + frontend)             │
│  └─ Aurora PostgreSQL (no public endpoint)             │
└────────────────────────────────────────────────────────┘
```

**Key Security Benefits:**
- ECS and Aurora have **no public IP addresses**
- Internet access only through NAT Gateways (egress only)
- ALB acts as single entry point
- Cross-zone redundancy for high availability

### Data Encryption

#### At Rest

| Resource          | Encryption Method           | Key Management |
|-------------------|-----------------------------|----------------|
| Aurora PostgreSQL | AES-256                     | AWS KMS        |
| SQS Queue         | SSE-SQS                     | AWS managed    |
| Secrets Manager   | AES-256                     | AWS KMS        |
| S3 (ALB logs)     | SSE-S3                      | AWS managed    |
| EBS (Fargate)     | AES-256                     | AWS managed    |
| CloudWatch Logs   | AES-256                     | AWS managed    |

**KMS Key Policy Example:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "Enable IAM User Permissions",
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::211125316068:root"
    },
    "Action": "kms:*",
    "Resource": "*"
  }, {
    "Sid": "Allow Aurora to use the key",
    "Effect": "Allow",
    "Principal": {
      "Service": "rds.amazonaws.com"
    },
    "Action": [
      "kms:Decrypt",
      "kms:GenerateDataKey"
    ],
    "Resource": "*",
    "Condition": {
      "StringEquals": {
        "kms:ViaService": "rds.us-east-1.amazonaws.com"
      }
    }
  }]
}
```

#### In Transit

- **ALB → Backend/Frontend:** HTTP (within VPC, considered secure)
  - Future: Configure service mesh (AWS App Mesh) for mTLS
- **Backend → Aurora:** TLS 1.2+ enforced
  - PostgreSQL connection string includes `sslmode=require`
- **Backend → SQS:** HTTPS only
- **Backend → Secrets Manager:** HTTPS only
- **Client → ALB:** HTTP (future: HTTPS with ACM certificate)

### IAM Least Privilege

#### Backend Task Role Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:us-east-1:211125316068:orders-queue"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:us-east-1:211125316068:orders-queue"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:211125316068:secret:dev-DatabaseStack-*"
    }
  ]
}
```

**Key Principles:**
- ✅ Only specific SQS actions (not `sqs:*`)
- ✅ Resource-specific ARNs (not `*`)
- ✅ Read-only Secrets Manager access
- ✅ No write access to database secrets
- ✅ No access to other AWS services

#### Execution Role Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage"
    ],
    "Resource": "*"
  }, {
    "Effect": "Allow",
    "Action": [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ],
    "Resource": "arn:aws:logs:us-east-1:211125316068:log-group:/aws/ecs/dev/*"
  }]
}
```

**Purpose:**
- ECR image pull during task startup
- CloudWatch Logs write access

---

## Threat Detection

### AWS GuardDuty

**Enabled Protections:**
- EC2 Protection (Fargate instances)
- S3 Protection (ALB access logs)
- RDS Protection (Aurora)
- Lambda Protection (order producer)
- Malware Protection (future: for uploaded files)

**Sample Threats Detected:**
- Cryptocurrency mining
- Unusual API call patterns
- Compromised credentials usage
- Port scanning/probing
- Data exfiltration attempts

**Finding Severity:**
- **HIGH/CRITICAL**: Sent to security SNS topic immediately
- **MEDIUM**: Daily summary email
- **LOW/INFORMATIONAL**: Aggregated weekly report

### AWS Security Hub

**Enabled Standards:**
- **AWS Foundational Security Best Practices (FSBP)**
- **CIS AWS Foundations Benchmark v1.4.0**

**Sample Checks:**
- EC2.2: VPC default security group should not allow inbound/outbound traffic
- RDS.1: RDS snapshots should be private
- S3.1: S3 Block Public Access should be enabled
- IAM.3: IAM users' access keys should be rotated every 90 days
- CloudTrail.1: CloudTrail should be enabled and configured

**EventBridge Integration:**
```typescript
new events.Rule(this, 'SecurityFindingsRule', {
  eventPattern: {
    source: ['aws.securityhub'],
    detailType: ['Security Hub Findings - Imported'],
    detail: {
      findings: {
        Severity: { Label: ['HIGH', 'CRITICAL'] },
        Workflow: { Status: ['NEW', 'NOTIFIED'] }
      }
    }
  },
  targets: [new targets.SnsTopic(securityAlertsTopic)]
});
```

### AWS Inspector v2

**Scanned Resources:**
- ECR container images (backend, frontend)
- Lambda functions (order producer)

**Vulnerability Types:**
- CVEs in OS packages
- CVEs in language libraries (npm, Python)
- Network reachability issues

**Continuous Scanning:**
- New images scanned automatically on push
- Existing images rescanned when new CVEs published
- Findings exported to Security Hub

---

## Compliance and Audit

### AWS CloudTrail

**Configuration:**
- Multi-region trail enabled
- Management events logged
- Data events for S3 buckets (future)
- Log file validation enabled (integrity)
- Logs encrypted with KMS
- S3 bucket: `order-processing-cloudtrail-{account-id}`
- Lifecycle: Transition to Glacier after 90 days, delete after 7 years

**Sample Events Logged:**
- ECS task starts/stops
- IAM role assumptions
- Secrets Manager access
- RDS snapshots
- Security group modifications

### AWS Config

**Monitored Resources:**
- EC2 Security Groups
- RDS Instances
- SQS Queues
- IAM Roles/Policies
- S3 Buckets

**Config Rules (Examples):**
```
- required-tags: All resources must have Environment and Project tags
- encrypted-volumes: All EBS volumes must be encrypted
- rds-snapshots-public-prohibited: RDS snapshots must be private
- vpc-sg-open-only-to-authorized-ports: Security groups follow standards
```

**Configuration Snapshots:**
- Frequency: Every 6 hours
- Retention: 7 years
- Delivery: S3 bucket

---

## Incident Response

### Runbooks

#### 1. Backend Service Down (All Tasks Unhealthy)

```bash
# Step 1: Check ECS service status
aws ecs describe-services --cluster order-processing-cluster --services order-processor-backend

# Step 2: Check recent task failures
aws ecs describe-tasks --cluster order-processing-cluster --tasks $(aws ecs list-tasks --cluster order-processing-cluster --service-name order-processor-backend --desired-status STOPPED --query 'taskArns[0]' --output text)

# Step 3: View container logs
aws logs tail /aws/ecs/dev/backend --follow --since 10m

# Step 4: Check recent deployments
aws ecs describe-services --cluster order-processing-cluster --services order-processor-backend --query 'services[0].deployments'

# Step 5: Rollback if needed (update to previous task definition)
aws ecs update-service --cluster order-processing-cluster --service order-processor-backend --task-definition backend-task-def:42
```

#### 2. Database Connection Failures

```bash
# Step 1: Check Aurora cluster status
aws rds describe-db-clusters --db-cluster-identifier dev-databasestack-auroracluster

# Step 2: Check security group rules
aws ec2 describe-security-groups --group-ids sg-xxx

# Step 3: Test connectivity from ECS task
aws ecs execute-command --cluster order-processing-cluster --task <task-arn> --container Backend --interactive --command "/bin/sh"
# Then: nc -zv <aurora-endpoint> 5432

# Step 4: Check Secrets Manager secret
aws secretsmanager get-secret-value --secret-id <secret-arn>

# Step 5: Review Aurora logs
aws rds describe-db-log-files --db-instance-identifier writer-instance
```

#### 3. SQS Messages Stuck in Queue

```bash
# Step 1: Check queue attributes
aws sqs get-queue-attributes --queue-url https://sqs.us-east-1.amazonaws.com/211125316068/orders-queue --attribute-names All

# Step 2: Inspect DLQ
aws sqs receive-message --queue-url https://sqs.us-east-1.amazonaws.com/211125316068/orders-dlq --max-number-of-messages 10

# Step 3: Check backend service scaling
aws application-autoscaling describe-scalable-targets --service-namespace ecs --resource-ids service/order-processing-cluster/order-processor-backend

# Step 4: Manual scale-up if needed
aws ecs update-service --cluster order-processing-cluster --service order-processor-backend --desired-count 5
```

### Security Incident Response Plan

**Phase 1: Detection and Analysis (15 minutes)**
1. Security Hub/GuardDuty finding received
2. Triage severity and impact
3. Identify affected resources
4. Collect initial logs and evidence

**Phase 2: Containment (30 minutes)**
1. Isolate affected resources (update security groups)
2. Rotate compromised credentials
3. Block malicious IPs (future: AWS WAF)
4. Preserve logs and snapshots for forensics

**Phase 3: Eradication (1-4 hours)**
1. Identify root cause
2. Remove malicious code/artifacts
3. Patch vulnerabilities
4. Deploy security updates

**Phase 4: Recovery (2-8 hours)**
1. Restore services from known-good state
2. Monitor for re-infection
3. Verify system integrity
4. Resume normal operations

**Phase 5: Post-Incident (1 week)**
1. Conduct post-mortem
2. Update security controls
3. Document lessons learned
4. Implement preventive measures

---

## Cost Optimization

### Monitoring Costs

| Service              | Dev (Monthly) | Prod (Monthly) |
|----------------------|---------------|----------------|
| CloudWatch Logs      | $5-10         | $50-100        |
| CloudWatch Metrics   | $3-5          | $10-20         |
| VPC Flow Logs        | $2-5          | $10-20         |
| GuardDuty            | $0 (trial)    | $30-50         |
| Security Hub         | $0 (trial)    | $10-15         |
| Inspector v2         | $2-5          | $10-15         |
| Config               | $2-5          | $10-15         |
| CloudTrail           | $2            | $2             |
| **Total**            | **$16-37**    | **$132-237**   |

### Cost Optimization Strategies

1. **Log Retention:** Reduce retention for non-critical logs
2. **Metric Resolution:** Use 1-minute resolution only for critical metrics
3. **VPC Flow Logs Filtering:** Log only rejected traffic (not all)
4. **GuardDuty:** Disable for development environments
5. **Security Hub:** Use FSBP only, disable CIS if not required
6. **S3 Lifecycle Policies:** Archive CloudTrail logs to Glacier

**Example: Optimized VPC Flow Logs**
```typescript
new ec2.FlowLog(this, 'VPCFlowLogs', {
  resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
  destination: ec2.FlowLogDestination.toCloudWatchLogs(logGroup),
  trafficType: ec2.FlowLogTrafficType.REJECT, // Only log rejected traffic
});
```

---

## Summary

This observability and security strategy provides:

✅ **Comprehensive Logging:** All components emit structured logs
✅ **Proactive Monitoring:** 20+ CloudWatch alarms covering all critical metrics
✅ **Defense in Depth:** 7 layers of security controls
✅ **Threat Detection:** GuardDuty, Security Hub, Inspector v2
✅ **Audit Trail:** CloudTrail + Config track all changes
✅ **Incident Response:** Documented runbooks for common scenarios
✅ **Cost Awareness:** Monitoring costs tracked and optimized

**Next Steps:**
1. Enable AWS WAF for application-layer protection
2. Implement centralized SIEM (Splunk, DataDog, or AWS Security Lake)
3. Add X-Ray distributed tracing for request flow visibility
4. Automate remediation with EventBridge + Lambda
5. Conduct quarterly security assessments and penetration tests
