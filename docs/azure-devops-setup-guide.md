# Azure DevOps Setup Guide

Complete guide for setting up Azure DevOps CI/CD pipeline for the Order Processing Infrastructure.

## Table of Contents

- [Overview](#overview)
- [Project Architecture](#project-architecture)
- [Prerequisites](#prerequisites)
- [Step 1: Create Azure DevOps Project](#step-1-create-azure-devops-project)
- [Step 2: Connect Repository](#step-2-connect-repository)
- [Step 3: Configure AWS Service Connections](#step-3-configure-aws-service-connections)
- [Step 4: Create Variable Groups](#step-4-create-variable-groups)
- [Step 5: Configure Environments](#step-5-configure-environments)
- [Step 6: Create Pipeline](#step-6-create-pipeline)
- [Step 7: Test Pipeline](#step-7-test-pipeline)
- [Database Migration Strategy](#database-migration-strategy)
- [Troubleshooting](#troubleshooting)

---

## Overview

This guide sets up a complete CI/CD pipeline using **one Azure DevOps project** with **one multi-stage pipeline** that handles both infrastructure and application deployment.

### Pipeline Structure

- **Build Stage**: Tests, linting, CDK synth, Docker builds
- **Deploy Dev Stage**: Auto-deploys to development environment on `develop` branch
- **Deploy Prod Stage**: Manual approval deployment to production on `main` branch

---

## Project Architecture

### Single Project Approach

Use **one Azure DevOps project** for both infrastructure and application code because:
- Infrastructure and application are tightly coupled
- They share the same repository
- They deploy together as a unit
- Easier dependency and version management

### Single Pipeline Approach

Use **one multi-stage pipeline** that handles both infrastructure and application deployment because:
- Infrastructure must be deployed before applications
- Docker images need ECR before ECS deployment
- Single pipeline ensures proper deployment order
- Easier to maintain and monitor

The existing `azure-pipelines.yml` already implements this correctly.

---

## Prerequisites

Before starting, ensure you have:

- Azure DevOps account (free at https://dev.azure.com)
- Valid AWS account and credentials 
- Repository hosted on Azure Repos or GitHub
- Administrator access to Azure DevOps organization

---

## Step 1: Create Azure DevOps Project

1. Navigate to https://dev.azure.com
2. Click **+ New Project**
3. Configure project settings:
   - **Project name**: `order-processing-infrastructure`
   - **Description**: AWS order processing system with CDK infrastructure
   - **Visibility**: Private
   - **Version control**: Git
   - **Work item process**: Agile
4. Click **Create**

---

## Step 2: Connect Repository

Choose one of the following options:

### Option A: Push to Azure Repos

```bash
cd /Users/steve/Documents/repos/Devops-Exam-A/order-processing-infrastructure

# Add Azure DevOps remote
git remote add azure https://dev.azure.com/<your-org>/order-processing-infrastructure/_git/order-processing-infrastructure

# Push all branches
git push azure main
git push azure develop  # if you have a develop branch
```

### Option B: Connect GitHub Repository

1. In Azure DevOps project, go to **Pipelines** → **Create Pipeline**
2. Select **GitHub** as code source
3. Authorize Azure Pipelines to access GitHub
4. Select your repository
5. Azure will detect the `azure-pipelines.yml` file

---

## Step 3: Configure AWS Service Connections

### Development Service Connection

1. In Azure DevOps, click **Project Settings** (bottom left corner)
2. Under **Pipelines**, click **Service connections**
3. Click **New service connection**
4. Select **AWS for .NET Core and .NET Standard**
5. Configure the connection:
   - **Access Key ID**: Retrieve from `creds.txt` file
   - **Secret Access Key**: Retrieve from `creds.txt` file
   - **Service connection name**: `aws-dev-service-connection`
   - **Description**: AWS credentials for development environment
   - **Grant access permission to all pipelines**: ✓ (checked)
6. Click **Verify and save**

### Production Service Connection (Optional)

For production deployments, create a second service connection:

1. Follow the same process as development
2. Use these settings:
   - **Service connection name**: `aws-prod-service-connection`
   - **Access Key ID**: Production AWS credentials
   - **Secret Access Key**: Production AWS credentials
3. Best practice: Use separate AWS account or IAM user with production-only permissions

---

## Step 4: Create Variable Groups

### Development Variable Group

1. Navigate to **Pipelines** → **Library**
2. Click **+ Variable group**
3. Configure the variable group:
   - **Variable group name**: `aws-credentials`
   - **Description**: AWS account details for development
4. Add the following variables:
   - **Name**: `AWS_ACCOUNT_ID`, **Value**: `211125316068`
   - **Name**: `AWS_REGION`, **Value**: `us-east-1`
5. Click **Save**

### Production Variable Group (Optional)

For production deployments:

1. Create new variable group: `aws-credentials-prod`
2. Add variables:
   - **Name**: `AWS_ACCOUNT_ID_PROD`, **Value**: `<production-account-id>`
   - **Name**: `AWS_REGION`, **Value**: `us-east-1`
3. Click **Save**

---

## Step 5: Configure Environments

### Development Environment

1. Navigate to **Pipelines** → **Environments**
2. Click **New environment**
3. Configure:
   - **Name**: `development`
   - **Description**: Development environment for auto-deployment
   - **Resource**: None
4. Click **Create**
5. No additional configuration needed (auto-deploy on develop branch)

### Production Environment

1. Click **New environment**
2. Configure:
   - **Name**: `production`
   - **Description**: Production environment with manual approval
   - **Resource**: None
3. Click **Create**

#### Add Approval Gate

1. Click on the `production` environment
2. Click **⋯** (three dots) → **Approvals and checks**
3. Click **+** → **Approvals**
4. Configure approvals:
   - **Approvers**: Add yourself and/or team members
   - **Minimum number of approvers**: 1 (or 2 for 4-eyes principle)
   - **Approvers can approve their own runs**: ✓ (for solo testing)
   - **Instructions for approvers**: "Review changes and CloudFormation stack status before approving production deployment"
   - **Timeout**: 30 days
5. Click **Create**

#### Add Business Hours Gate (Optional)

1. In the same **Approvals and checks** menu, click **+**
2. Select **Business hours**
3. Configure:
   - **Time zone**: Your timezone
   - **Days**: Monday - Friday
   - **Start time**: 09:00 AM
   - **End time**: 05:00 PM
4. Click **Create**

---

## Step 6: Create Pipeline

### For Azure Repos

1. Navigate to **Pipelines** → **Pipelines**
2. Click **New Pipeline**
3. Select **Azure Repos Git**
4. Select your repository: `order-processing-infrastructure`
5. Select **Existing Azure Pipelines YAML file**
6. Configure:
   - **Branch**: main
   - **Path**: `/azure-pipelines.yml`
7. Click **Continue**
8. Review the pipeline YAML
9. Click **Run**

### For GitHub

1. Navigate to **Pipelines** → **Pipelines**
2. Click **New Pipeline**
3. Select **GitHub**
4. Authorize Azure Pipelines (if not already authorized)
5. Select your repository
6. Azure will automatically detect `azure-pipelines.yml`
7. Click **Run**

### Pipeline Naming

After creation, rename your pipeline for clarity:

1. Click **⋯** (three dots) on pipeline
2. Select **Rename/move**
3. Name: `Order Processing CI/CD`
4. Click **Save**

---

## Step 7: Test Pipeline

### First Pipeline Run

1. Navigate to your repository
2. Create a small change (e.g., update README.md)
3. Commit to `develop` branch:
   ```bash
   git checkout develop
   git add README.md
   git commit -m "test: trigger pipeline"
   git push origin develop
   ```
4. Pipeline should automatically trigger
5. Monitor pipeline execution in Azure DevOps

### Expected Behavior

**On develop branch push:**
- Build stage runs (tests, linting, CDK synth)
- DeployDev stage runs automatically
- DeployProd stage is skipped

**On main branch push:**
- Build stage runs
- DeployDev stage is skipped
- DeployProd stage waits for manual approval
- After approval, deploys to production

### Verify Deployment

After pipeline completes:

```bash
# Get ALB URL from CloudFormation
aws cloudformation describe-stacks \
  --stack-name dev-ApplicationStack \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerURL`].OutputValue' \
  --output text

# Test health endpoint
curl http://<alb-url>/health

# Test API
curl http://<alb-url>/api/orders
```

---

## Database Migration Strategy

### Current Implementation

The current deployment uses automatic schema creation on application startup:
- Location: `app/backend/src/database.ts` lines 95-130
- Creates `orders` table using `CREATE TABLE IF NOT EXISTS`
- Creates indexes automatically
- Idempotent and safe for multiple runs

### Production-Ready Migration System

For production deployments, implement a versioned migration system using ECS migration tasks.

#### Migration Directory Structure

```
app/backend/migrations/
├── 001_create_orders_table.sql
├── 002_add_status_index.sql
├── 003_add_audit_columns.sql
└── run-migrations.ts
```

#### Migration Files

**001_create_orders_table.sql:**
```sql
CREATE TABLE IF NOT EXISTS orders (
  order_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  items JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
```

**002_add_migration_tracking.sql:**
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Migration Runner Script

Create `app/backend/migrations/run-migrations.ts`:

```typescript
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as fs from 'fs';
import * as path from 'path';

async function runMigrations() {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable required');
  }

  // Get database credentials
  const secretsClient = new SecretsManagerClient({});
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );
  const secret = JSON.parse(response.SecretString!);

  // Connect to database
  const pool = new Pool({
    user: secret.username,
    password: secret.password,
    host: secret.host,
    port: secret.port,
    database: secret.dbname,
  });

  try {
    // Create migration tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get applied migrations
    const { rows } = await pool.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedVersions = new Set(rows.map(r => r.version));

    // Read and sort migration files
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Apply pending migrations
    for (const file of files) {
      const version = parseInt(file.split('_')[0]);

      if (appliedVersions.has(version)) {
        console.log(`✓ Migration ${version} already applied`);
        continue;
      }

      console.log(`→ Applying migration ${version}: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Use transaction for safety
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await pool.query('COMMIT');
        console.log(`✓ Migration ${version} completed successfully`);
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`✗ Migration ${version} failed:`, error);
        throw error;
      }
    }

    console.log('All migrations completed successfully');
  } finally {
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

#### Pipeline Integration

Add migration step to `azure-pipelines.yml` before deploying application:

```yaml
# Add to DeployDev stage, before "Deploy CDK stacks"
- script: |
    # Get database secret ARN from CloudFormation
    DB_SECRET_ARN=$(aws cloudformation describe-stacks \
      --stack-name dev-DatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
      --output text)

    # Get VPC configuration
    PRIVATE_SUBNETS=$(aws cloudformation describe-stacks \
      --stack-name dev-NetworkStack \
      --query 'Stacks[0].Outputs[?OutputKey==`PrivateSubnets`].OutputValue' \
      --output text)

    DB_SECURITY_GROUP=$(aws cloudformation describe-stacks \
      --stack-name dev-DatabaseStack \
      --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecurityGroup`].OutputValue' \
      --output text)

    # Run migration task
    TASK_ARN=$(aws ecs run-task \
      --cluster order-processing-cluster \
      --task-definition order-processor-backend:latest \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[${PRIVATE_SUBNETS}],securityGroups=[${DB_SECURITY_GROUP}],assignPublicIp=DISABLED}" \
      --overrides "{\"containerOverrides\":[{\"name\":\"backend\",\"command\":[\"ts-node\",\"migrations/run-migrations.ts\"],\"environment\":[{\"name\":\"DB_SECRET_ARN\",\"value\":\"${DB_SECRET_ARN}\"}]}]}" \
      --query 'tasks[0].taskArn' \
      --output text)

    # Wait for migration to complete
    aws ecs wait tasks-stopped \
      --cluster order-processing-cluster \
      --tasks ${TASK_ARN}

    # Check exit code
    EXIT_CODE=$(aws ecs describe-tasks \
      --cluster order-processing-cluster \
      --tasks ${TASK_ARN} \
      --query 'tasks[0].containers[0].exitCode' \
      --output text)

    if [ "${EXIT_CODE}" != "0" ]; then
      echo "Migration failed with exit code ${EXIT_CODE}"
      exit 1
    fi

    echo "Database migrations completed successfully"
  displayName: 'Run database migrations'
  env:
    AWS_REGION: $(AWS_REGION)
```

#### Migration Best Practices

1. **Version Control**: Store all migrations in source control
2. **Sequential Numbering**: Use 001, 002, 003 format
3. **Idempotent**: Use `IF NOT EXISTS` and `IF EXISTS` where possible
4. **Transactional**: Wrap migrations in transactions
5. **Rollback Scripts**: Maintain down migrations for each up migration
6. **Testing**: Test migrations in staging before production
7. **Backup**: Create database backup before production migrations

---

## Troubleshooting

### Pipeline Doesn't Trigger

**Symptom**: Pipeline doesn't run when code is pushed

**Solutions**:
- Verify `azure-pipelines.yml` exists in repository root
- Check trigger configuration in YAML matches your branch names
- Ensure pipeline is not disabled (Pipelines → Select pipeline → Edit → Enable)

### AWS Credentials Invalid

**Symptom**: "Access denied" or authentication errors

**Solutions**:
- Verify service connection uses correct credentials from `creds.txt`
- Test AWS credentials locally: `aws sts get-caller-identity`
- Check IAM permissions include CloudFormation, ECS, ECR, RDS, etc.
- Verify AWS_ACCOUNT_ID in variable group matches your account

### Docker Build Fails

**Symptom**: Docker build or push fails in pipeline

**Solutions**:
- Ensure ECR repositories exist:
  ```bash
  aws ecr create-repository --repository-name order-processor-backend
  aws ecr create-repository --repository-name order-processor-frontend
  ```
- Verify pipeline has Docker enabled (Azure Pipelines uses ubuntu-latest with Docker pre-installed)
- Check Dockerfile syntax and paths
- Verify AWS credentials have ECR permissions

### CDK Deploy Fails

**Symptom**: `cdk deploy` command fails

**Solutions**:
- Check CloudFormation stack status in AWS Console
- Verify AWS credentials have sufficient permissions
- Check for resource limits (VPC limits, EIP limits, etc.)
- Review CloudFormation events for specific error messages
- Ensure CDK bootstrap was run: `cdk bootstrap aws://ACCOUNT/REGION`

### Environment Approval Not Working

**Symptom**: Production deployment doesn't wait for approval

**Solutions**:
- Verify environment name in YAML matches environment in Azure DevOps exactly
- Check approval configuration is saved on the environment
- Ensure pipeline has permission to use the environment
- Review pipeline run logs for permission errors

### Variables Not Available

**Symptom**: Pipeline can't access variable group values

**Solutions**:
- Verify variable group is linked in YAML:
  ```yaml
  variables:
    - group: aws-credentials
  ```
- Check variable group permissions allow pipeline access
- Ensure variable names in YAML match variable group exactly (case-sensitive)

### Database Connection Fails

**Symptom**: Application can't connect to Aurora database

**Solutions**:
- Verify database is in available state: `aws rds describe-db-clusters`
- Check security group allows inbound from ECS tasks
- Verify Secrets Manager ARN is correct in environment variables
- Check VPC configuration allows routing between ECS and RDS subnets
- Review CloudWatch logs for detailed error messages

### Migration Task Fails

**Symptom**: Database migration task exits with error

**Solutions**:
- Review ECS task logs in CloudWatch
- Verify migration SQL syntax
- Check database credentials in Secrets Manager
- Ensure migration runner has network access to database
- Test migration script locally against database

---

## Next Steps

After completing this setup:

1. ✅ Push code to trigger first pipeline run
2. ✅ Monitor Build stage for any test failures
3. ✅ Verify dev deployment completes successfully
4. ✅ Test deployed application endpoints
5. ✅ Configure notifications (Slack/Teams/Email)
6. ✅ Set up branch policies for protected branches
7. ✅ Review CloudWatch logs and metrics
8. ✅ Document team deployment procedures

---

## Additional Resources

- [Azure Pipelines Documentation](https://docs.microsoft.com/en-us/azure/devops/pipelines/)
- [AWS CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [CI/CD Strategy Document](./cicd-strategy.md)
- [Project README](../README.md)
