# Observability & Security Plan

*Brief plan addressing monitoring/logging of key components (RDS, ECS, ALB) and security risk mitigations.*

## Monitoring & Logging (Current Implementation)

### Application Load Balancer
- **Metrics**: CloudWatch automatically tracks request count, latency (p50/p90/p99), HTTP status codes, healthy/unhealthy target counts
- **Access Logs**: Stored in S3 with 30-day lifecycle policy, contains client IP, request path, response codes, latency
- **Key Metrics**: `TargetResponseTime`, `UnhealthyHostCount`, `HTTPCode_Target_5XX_Count`

### ECS Fargate Services
- **Container Logs**: Streamed to CloudWatch Logs (`/aws/ecs/dev/backend`, `/aws/ecs/dev/frontend`)
- **Log Format**: Structured JSON with timestamp, level, service name, message, and context fields
- **Retention**: 7 days (dev), 90 days recommended (prod)
- **Metrics**: CPU utilization, memory utilization, running task count, deployment status
- **Auto-Scaling**: Configured to scale on CPU (80% threshold) and memory (85% threshold)

### Aurora Serverless v2 (RDS)
- **Database Logs**: PostgreSQL logs exported to CloudWatch (`/aws/rds/cluster/dev-auroracluster/postgresql`)
- **Metrics**: ACU utilization, database connections, CPU%, read/write latency, storage usage
- **Backups**: Automated with 7-day retention (dev), 35-day (prod)
- **Encryption**: At-rest using KMS, in-transit via TLS 1.2+

### Additional Components
- **VPC Flow Logs**: Enabled, sent to CloudWatch Logs for network traffic analysis
- **SQS**: Message count, age of oldest message, DLQ depth
- **Lambda (Order Producer)**: Invocation count, duration, errors, throttles

## Security Controls (Current Implementation)

### Network Security
**Architecture**: ALB in public subnets (10.0.0.x/24), ECS and Aurora in private subnets (10.0.3.x/24) with no public IPs. NAT Gateways provide egress-only internet access.

**Security Groups**:
- ALB: Inbound HTTP (80) from internet, outbound to backend/frontend
- Backend: Inbound 3000 from ALB only, outbound to Aurora (5432) and AWS APIs (443)
- Frontend: Inbound 80 from ALB only
- Aurora: Inbound 5432 from VPC CIDR only

### Data Protection
- **Encryption at Rest**: Aurora (KMS), SQS (SSE-SQS), Secrets Manager (KMS), S3 (SSE-S3)
- **Encryption in Transit**: Aurora TLS 1.2+, AWS API calls over HTTPS
- **Secrets Management**: Database credentials auto-generated, stored in Secrets Manager (never in code)

### Access Control
- **IAM Least Privilege**: ECS task roles limited to specific SQS queues and Secrets Manager read-only
- **WAF**: Configured with rate limiting (2000 requests/5min/IP), logging enabled in production

### Application Security
- **Input Validation**: Implemented in application code
- **SQL Injection Prevention**: Parameterized queries with pg library
- **Vulnerability Scanning**: npm audit in CI/CD pipeline

## Security Risks & Mitigations

### 1. No Audit Trail of Infrastructure Changes
**Risk**: Without CloudTrail, cannot determine who made infrastructure changes, when, or from where during security investigations.

**Mitigation**: Enable CloudTrail by setting `enableCloudTrail: true` in `lib/config/environment-config.ts`. CloudTrail logs all API calls to S3 with encryption and log file validation.

**Cost**: ~$2-5/month

### 2. No Threat Detection
**Risk**: Malicious activity (compromised credentials, crypto mining, data exfiltration, port scanning) goes undetected.

**Mitigation**: Enable GuardDuty (`enableGuardDuty: true`) for ML-based threat detection. Configure EventBridge to alert on HIGH/CRITICAL findings.

**Impact**: Reduces time-to-detect from months to hours.

**Cost**: ~$30-50/month

### 3. No Compliance Monitoring
**Risk**: Security misconfigurations (public S3 buckets, overly permissive security groups, unencrypted resources) are not automatically detected.

**Mitigation**: Enable Security Hub (`enableSecurityHub: true`) with AWS Foundational Security Best Practices standard. Review weekly, remediate HIGH within 7 days.

**Cost**: ~$10-15/month

### 4. No Container Vulnerability Scanning
**Risk**: Container images may contain known CVEs in OS packages or application dependencies.

**Mitigation**: Enable Inspector v2 (`enableInspector: true`) for continuous ECR image scanning. Configure CI/CD to block deployment of images with CRITICAL CVEs.

**Cost**: ~$10-15/month

### 5. No Configuration Change Tracking
**Risk**: Cannot answer "who changed the security group rules last Tuesday?" or prove compliance state at a specific point in time.

**Mitigation**: Enable AWS Config (`enableConfig: true`) to track resource configuration history. Create Config rules for tagging, encryption, and security group compliance.

**Cost**: ~$10-15/month

### 6. Limited Observability for Troubleshooting
**Risk**: When requests fail or slow down, must manually correlate logs across ALB, ECS, and Aurora. Cannot visualize request flow or identify bottlenecks.

**Mitigation**:
- Enable AWS X-Ray for distributed tracing (shows request flow, latency breakdown, error correlation)
- Enable RDS Performance Insights (query-level analysis, wait events, top SQL)
- Configure CloudWatch Alarms for critical thresholds (unhealthy hosts, high CPU, database connections)

**Cost**: ~$5-10/month (X-Ray dev), free (Performance Insights 7-day retention)

### 7. No Cost Monitoring
**Risk**: Unexpected cost spikes from misconfiguration or compromised accounts go undetected until monthly bill.

**Mitigation**: Enable AWS Cost Anomaly Detection with $100 threshold for alerts.

**Cost**: Free

### 8. HTTP-Only Load Balancer
**Risk**: Traffic between clients and ALB is unencrypted (man-in-the-middle risk).

**Mitigation**: Provision ACM certificate, configure HTTPS listener on port 443, redirect HTTP→HTTPS, enforce TLS 1.2+.

**Cost**: Free (ACM)

### 9. No Automated Alerting
**Risk**: High CPU, memory exhaustion, unhealthy targets, or database connection failures don't trigger immediate alerts.

**Mitigation**: Create CloudWatch Alarms for:
- ALB: `UnhealthyHostCount >= 1` (1min), `TargetResponseTime p99 > 2000ms` (5min)
- ECS: `CPUUtilization > 80%` (5min), `RunningTaskCount < DesiredCount` (1min)
- Aurora: `DatabaseConnections > 80%` (5min), `CPUUtilization > 80%` (5min)
- SQS: `ApproximateAgeOfOldestMessage > 300s` (5min), DLQ depth > 0 (immediate)

Send alerts to SNS topics for email/Slack integration.

**Cost**: Free (within CloudWatch free tier)

## Production Requirements

To make this deployment production-ready, enable the following in `lib/config/environment-config.ts`:

```typescript
securityConfig: {
  enableCloudTrail: true,    // Audit trail (compliance requirement)
  enableGuardDuty: true,     // Threat detection (security requirement)
  enableSecurityHub: true,   // Compliance scanning (audit requirement)
  enableInspector: true,     // Vulnerability scanning (security requirement)
  enableConfig: true,        // Configuration tracking (compliance requirement)
}
```

**Total Additional Cost**: ~$65-100/month (production environment)

**Additional Recommendations**:
1. Create monitoring stack with CloudWatch Alarms (alarms exist in code, stack needs creation)
2. Enable AWS X-Ray distributed tracing
3. Enable RDS Performance Insights (free for 7-day retention)
4. Configure HTTPS with ACM certificate
5. Implement automated secrets rotation (30-day cycle)
6. Set up multi-account structure (dev/staging/prod isolation)
7. Enable AWS Cost Anomaly Detection
8. Configure SNS topics for alert notifications
9. Create runbooks for common incident scenarios
10. Schedule quarterly security reviews and penetration testing

## References

- [AWS Security Best Practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/)
- [CloudWatch Alarms Best Practices](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html)
- [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- Internal: `lib/config/environment-config.ts` - Security service configuration flags
- Internal: `lib/stacks/network-stack.ts` - VPC Flow Logs implementation
- Internal: `lib/stacks/waf-stack.ts` - WAF rate limiting configuration
