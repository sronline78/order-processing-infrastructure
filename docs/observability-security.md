# Observability & Security Plan

## Table of Contents
- [Overview](#overview)
- [Current Implementation](#current-implementation)
  - [Monitoring & Logging](#monitoring--logging)
  - [Security Controls](#security-controls)
- [Security Gaps & Risks](#security-gaps--risks)
- [Recommended Enhancements](#recommended-enhancements)
  - [Security Services](#security-services)
  - [Advanced Monitoring](#advanced-monitoring)
- [References](#references)

## Overview

This plan addresses Part 3 of the infrastructure requirements: monitoring/logging of key components (RDS, ECS, ALB) and identifying security risks with proposed mitigations. The current deployment implements foundational observability and security controls, but lacks several AWS security services required for production-grade deployments.

## Current Implementation

### Monitoring & Logging

**Application Load Balancer (ALB):**
- CloudWatch metrics automatically collected (request count, latency, HTTP status codes, healthy/unhealthy hosts)
- Access logs stored in S3 bucket with 30-day lifecycle policy
- Key metrics: `TargetResponseTime`, `UnhealthyHostCount`, `HTTPCode_Target_5XX_Count`
- No alarms currently configured

**ECS Fargate Services (Backend & Frontend):**
- Container logs streamed to CloudWatch Logs at `/aws/ecs/dev/backend` and `/aws/ecs/dev/frontend`
- Structured JSON logging for backend application (timestamp, level, service, message, context)
- Log retention: 7 days (development), 90 days recommended for production
- Metrics tracked: CPU utilization, memory utilization, running task count
- Auto-scaling configured based on CPU/memory thresholds (80% CPU triggers scale-up)

**Aurora Serverless v2 (RDS):**
- PostgreSQL logs exported to CloudWatch at `/aws/rds/cluster/dev-auroracluster/postgresql`
- Metrics monitored: ACU utilization, database connections, CPU utilization, read/write latency
- Storage encrypted at rest using AWS KMS
- Automated backups with 7-day retention (dev), 35-day retention (production)
- No Performance Insights enabled (would add query-level visibility)

**Additional Logging:**
- SQS queue metrics: message count, age of oldest message, DLQ message count
- Lambda (order producer): invocation count, duration, errors, throttles
- VPC Flow Logs: Not currently enabled (gap identified)

**Monitoring Dashboard:**

The CloudWatch dashboard provides real-time visibility into system health with metrics aggregated from ALB (request rate, latency, error rates), ECS (task health, resource utilization), Aurora (capacity, connections, latency), and SQS (queue depth, processing lag). This gives operators a single-pane view of the entire order processing pipeline from ingress through data persistence.

### Security Controls

**Network Segmentation:**

The architecture follows a defense-in-depth approach with strict network isolation. Public subnets (10.0.0.x/24) host only the ALB, which serves as the single entry point. Private subnets (10.0.3.x/24) contain ECS tasks and Aurora with no public IP addresses or internet-facing endpoints. NAT Gateways provide egress-only internet access for software updates and AWS API calls. This design prevents direct access to compute and data layers while maintaining operational functionality.

**Security Groups:**
- ALB: Inbound HTTP (port 80) from 0.0.0.0/0, outbound to backend/frontend security groups
- Backend: Inbound port 3000 from ALB only, outbound to Aurora (5432) and AWS services (443)
- Frontend: Inbound port 80 from ALB only, outbound to internet for CDN/assets
- Aurora: Inbound port 5432 from VPC CIDR (10.0.0.0/16) only, no outbound rules

**Encryption:**
- At-rest: Aurora (KMS), SQS (SSE-SQS), Secrets Manager (KMS), S3 (SSE-S3)
- In-transit: Aurora connections require TLS 1.2+, AWS API calls over HTTPS
- Limitation: ALB serves HTTP only (no SSL/TLS certificate configured)

**IAM & Access Control:**
- ECS task roles use least-privilege policies (specific SQS queues, read-only Secrets Manager)
- Database credentials auto-generated and stored in Secrets Manager (never in code)
- Secrets rotation: Manual (should be automated with Lambda rotation function)

**Application Security:**
- WAF configured with rate limiting (2000 requests per 5 minutes per IP)
- WAF logging disabled in dev (enabled in production config)
- Input validation in application code
- No SQL injection risk (parameterized queries with pg library)

**Vulnerability Management:**
- NPM audit runs in CI/CD pipeline (informational, doesn't block deployment)
- Container image scanning: Not implemented (Inspector v2 disabled)
- Fargate automatically updates base OS images (no manual patching required)

## Security Gaps & Risks

**Critical Gap: Absence of AWS Security Services**

The current deployment has all security services disabled in `lib/config/environment-config.ts`:

```typescript
securityConfig: {
  enableCloudTrail: false,   // No audit trail of API calls
  enableGuardDuty: false,    // No threat detection
  enableSecurityHub: false,  // No compliance scanning
  enableInspector: false,    // No container vulnerability scanning
  enableConfig: false,       // No resource configuration tracking
}
```

This creates significant security risks:

**1. No Audit Trail (CloudTrail Disabled)**

*Risk:* Without CloudTrail, there's no record of who made changes to infrastructure, when, or from where. If a security incident occurs (compromised credentials, unauthorized changes, data breach), forensic investigation would be impossible.

*Impact:*
- Cannot detect unauthorized API calls or privilege escalation
- No compliance audit trail for SOC 2, HIPAA, or PCI-DSS
- Unable to correlate security events across services
- No automated alerting on suspicious activity patterns

*Example Attack Scenario:* An attacker gains access to IAM credentials and deletes the Aurora database. Without CloudTrail, you cannot determine when it happened, which credentials were used, or if other resources were compromised.

**2. No Threat Detection (GuardDuty Disabled)**

*Risk:* GuardDuty analyzes VPC Flow Logs, DNS logs, and CloudTrail events for malicious activity using machine learning. Without it, threats go undetected until damage occurs.

*Threats Missed:*
- Cryptocurrency mining on ECS tasks (unusual outbound connections)
- Compromised EC2 instances communicating with known malware C&C servers
- Data exfiltration to suspicious external IPs
- Port scanning and reconnaissance activities
- Compromised IAM credentials used from unusual locations

*Impact:* Average time to detect a breach without GuardDuty: 280+ days (industry average). With GuardDuty: Minutes to hours.

**3. No Compliance Monitoring (Security Hub Disabled)**

*Risk:* Security Hub aggregates findings from GuardDuty, Inspector, and other sources while continuously checking against compliance standards (CIS AWS Foundations, NIST, PCI-DSS).

*Compliance Violations Undetected:*
- S3 buckets with public access enabled
- Security groups allowing unrestricted inbound access (0.0.0.0/0 on sensitive ports)
- Unencrypted EBS volumes or snapshots
- IAM users without MFA enabled
- RDS snapshots shared publicly

*Impact:* Failed audits, regulatory fines, certification delays. Security Hub provides a unified dashboard showing security posture score and prioritized remediation actions.

**4. No Vulnerability Scanning (Inspector Disabled)**

*Risk:* Container images and Lambda functions may contain known CVEs (Common Vulnerabilities and Exposures) in OS packages or application dependencies.

*Examples:*
- Node.js application uses library with remote code execution vulnerability
- Base Docker image contains outdated OpenSSL with known exploits
- Lambda function dependencies have high-severity CVEs

*Impact:* Attackers exploit known vulnerabilities to gain container access, escalate privileges, or exfiltrate data. Inspector v2 provides continuous scanning that alerts within hours of new CVE publication.

**5. No Configuration Management (AWS Config Disabled)**

*Risk:* AWS Config tracks resource configuration changes over time and evaluates compliance with organizational rules.

*Problems Without Config:*
- Cannot answer "who changed the security group rules last Tuesday?"
- No automated enforcement of tagging policies
- Security group changes that expose databases go unnoticed
- Cannot prove compliance state at a specific point in time

*Example:* A developer accidentally opens port 5432 to 0.0.0.0/0 on the Aurora security group. Without Config, this remains undetected until exploited.

**6. No Distributed Tracing (X-Ray Disabled)**

*Risk:* When requests fail or slow down, troubleshooting requires manual log correlation across ALB, ECS, and Aurora.

*Operational Impact:*
- Cannot visualize request flow through the system
- Difficult to identify bottlenecks in multi-service architectures
- No latency breakdown (how much time in database vs. application logic?)
- Complex debugging for intermittent failures

**7. Missing Cost Anomaly Detection**

*Risk:* Unexpected cost spikes from resource misconfiguration, compromised accounts, or runaway auto-scaling go undetected until the monthly bill arrives.

*Examples:*
- Attacker uses compromised credentials to launch hundreds of EC2 instances for cryptocurrency mining
- Bug causes infinite auto-scaling loop
- Forgotten test resources running 24/7 in development account

*Impact:* Without AWS Cost Anomaly Detection, you discover a $50,000 bill weeks after the incident when prevention would have cost $0.

**Additional Risks:**

- **No VPC Flow Logs:** Cannot investigate network-based attacks, detect port scanning, or analyze traffic patterns
- **No HTTPS on ALB:** Traffic between clients and ALB is unencrypted (man-in-the-middle risk)
- **Manual Secrets Rotation:** Database credentials never rotate (increased risk if compromised)
- **No CloudWatch Alarms:** High CPU, memory exhaustion, or database connection failures don't trigger alerts
- **Single Account:** No organizational structure with isolated accounts for dev/staging/prod (blast radius of compromise includes all environments)

## Recommended Enhancements

### Security Services

**Phase 1: Foundation (Week 1)**

Enable core security services by updating `lib/config/environment-config.ts`:

```typescript
securityConfig: {
  enableCloudTrail: true,    // Audit all API calls
  enableGuardDuty: true,     // Threat detection
  enableSecurityHub: true,   // Compliance monitoring
  enableInspector: true,     // Container vulnerability scanning
  enableConfig: true,        // Configuration tracking
}
```

**Implementation:**

1. **CloudTrail**: Create multi-region trail with log file validation, encrypt logs with KMS, store in S3 with lifecycle policy (90 days → Glacier → 7 years). Estimated cost: $2-5/month.

2. **GuardDuty**: Enable with one click (no agents required). Configure EventBridge rule to send HIGH/CRITICAL findings to SNS topic for immediate alerting. Estimated cost: $30-50/month.

3. **Security Hub**: Enable AWS Foundational Security Best Practices standard. Review findings weekly, remediate HIGH severity issues within 7 days, CRITICAL within 24 hours. Estimated cost: $10-15/month.

4. **Inspector v2**: Enable ECR and Lambda scanning. Configure to block deployment of images with CRITICAL CVEs. Set up automated ticketing for HIGH severity findings. Estimated cost: $10-15/month.

5. **AWS Config**: Track security group, IAM, RDS, and S3 bucket configurations. Create Config rules for required tags, encryption enforcement, and security group restrictions. Estimated cost: $10-15/month.

**Phase 2: Advanced Protections (Week 2-3)**

1. **VPC Flow Logs**: Enable for all VPCs, send to CloudWatch Logs. Log only rejected traffic to reduce costs (accepted traffic not typically useful for security analysis). Create metric filters for:
   - Rejected traffic from known malicious IPs
   - High volume of rejected traffic (port scanning detection)
   - Unusual outbound traffic patterns

2. **AWS Cost Anomaly Detection**: Configure with $100 threshold for alerts. Monitor EC2, ECS, RDS, and Lambda spending. Set up SNS notifications to finance and engineering teams.

3. **CloudWatch Alarms**: Create alarms for critical thresholds:
   - ALB: `UnhealthyHostCount >= 1` (1 minute), `TargetResponseTime p99 > 2000ms` (5 minutes)
   - ECS: `CPUUtilization > 80%` (5 minutes), `RunningTaskCount < DesiredCount` (1 minute)
   - Aurora: `DatabaseConnections > 80%` (5 minutes), `CPUUtilization > 80%` (5 minutes)
   - SQS: `ApproximateAgeOfOldestMessage > 300s` (5 minutes), DLQ message count > 0 (immediate)

4. **Secrets Rotation**: Enable automatic rotation for Aurora credentials (30-day cycle) using Lambda rotation function. Estimated cost: Negligible (few Lambda invocations per month).

**Phase 3: Advanced Monitoring (Month 2)**

1. **AWS X-Ray**: Enable distributed tracing for ECS services and Lambda. Instrument backend application with X-Ray SDK to trace:
   - SQS message processing latency
   - Database query performance
   - API endpoint response times
   - Error rates by service component

   Benefits: Visualize request flow, identify bottlenecks, correlate errors across services. Estimated cost: $5-10/month (dev), $20-40/month (production).

2. **RDS Performance Insights**: Enable 7-day retention. Provides database-level query analysis, wait event identification, and top SQL queries by resource consumption. Estimated cost: Free tier (7-day retention).

3. **CloudWatch Contributor Insights**: Analyze ALB access logs to identify:
   - Top IP addresses by request count (identify scrapers/bots)
   - Most expensive API endpoints (high latency)
   - Error patterns by user agent or geography

4. **CloudWatch Anomaly Detection**: Create ML-powered alarms that detect unusual patterns in metrics (e.g., request count drops by 50%, CPU spikes outside normal range). Reduces false positives from static thresholds.

**Phase 4: Production Hardening (Month 3)**

1. **HTTPS/TLS**: Provision ACM certificate, configure ALB HTTPS listener (port 443), redirect HTTP → HTTPS, enforce TLS 1.2+. Configure security headers (HSTS, X-Frame-Options, CSP).

2. **AWS WAF Enhanced Rules**: Add managed rule groups:
   - Core Rule Set (OWASP Top 10 protection)
   - Known Bad Inputs (SQL injection, XSS)
   - IP Reputation Lists (known malicious sources)
   - Bot Control (detect and block bots)

3. **Multi-Account Strategy**: Use AWS Organizations to separate:
   - Development account (isolated from production)
   - Staging account (production-like environment)
   - Production account (restricted access, MFA required)
   - Security/audit account (centralized logging, read-only access)

   Benefits: Reduces blast radius of compromised credentials, enforces environment isolation, enables different security controls per environment.

4. **Automated Remediation**: Create EventBridge rules with Lambda functions to auto-remediate common security findings:
   - Security group opened to 0.0.0.0/0 → automatically revert change
   - S3 bucket public access enabled → automatically re-enable block public access
   - Unencrypted resource created → tag for remediation or auto-delete

### Advanced Monitoring

**Centralized Logging (Optional):**

For multi-account deployments, aggregate all logs in a central security account using CloudWatch cross-account log subscriptions or AWS Security Lake. This provides unified search across all environments and prevents log tampering by compromised accounts.

**Third-Party SIEM Integration:**

Export CloudWatch Logs, CloudTrail, and Security Hub findings to enterprise SIEM platforms (Splunk, Datadog, Sumo Logic) for:
- Correlation with non-AWS security events
- Advanced threat hunting and analytics
- Long-term log retention (7+ years)
- Compliance reporting (SOC 2, ISO 27001)

**Incident Response Automation:**

Use EventBridge to trigger automated incident response workflows:
- GuardDuty finding → Lambda → Quarantine compromised instance (isolate security group)
- Inspector critical CVE → Lambda → Roll back ECS task definition to previous version
- Cost anomaly detected → Lambda → Send detailed report with resource recommendations

## References

### Implementation Guides
- [AWS Security Best Practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/)
- [CloudWatch Alarms Best Practices](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html)
- [GuardDuty Getting Started](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_settingup.html)
- [Security Hub Standards](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-standards.html)
- [Inspector v2 Container Scanning](https://docs.aws.amazon.com/inspector/latest/user/scanning-ecr.html)
- [AWS X-Ray Tracing](https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html)

### Compliance Frameworks
- [CIS AWS Foundations Benchmark](https://www.cisecurity.org/benchmark/amazon_web_services)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)

### Internal Documentation
- `lib/config/environment-config.ts` - Security service configuration flags
- `lib/stacks/monitoring-stack.ts` - CloudWatch alarms and dashboards (not yet implemented)
- `docs/cicd-strategy.md` - NPM audit in CI/CD pipeline
- `README.md` - Current monitoring dashboard description
