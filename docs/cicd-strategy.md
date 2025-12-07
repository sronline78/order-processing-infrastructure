# CI/CD Strategy: Azure DevOps Pipeline

## Overview

This document outlines the CI/CD strategy for the Order Processing Infrastructure using **Azure DevOps Pipelines**. The pipeline automates testing, building, and deployment of both the infrastructure (AWS CDK) and applications (Docker containers).

## Pipeline Architecture

### Multi-Stage Pipeline Design

```
┌─────────────────┐
│  Build Stage    │  - Install dependencies
│                 │  - Run linting & tests
│                 │  - CDK synth
│                 │  - Build Docker images
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Dev Deploy     │  - Auto-deploy on 'develop' branch
│                 │  - Push images to ECR
│                 │  - CDK deploy to dev environment
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Prod Deploy    │  - Manual approval required
│                 │  - Deploy on 'main' branch only
│                 │  - 4-eyes principle
│                 │  - Deploy to production
└─────────────────┘
```

### azure-pipelines.yml

```yaml
trigger:
  branches:
    include:
      - main
      - develop
  paths:
    exclude:
      - README.md
      - docs/**

pr:
  branches:
    include:
      - main
      - develop

variables:
  - group: aws-credentials
  - name: NODE_VERSION
    value: '20.x'
  - name: AWS_REGION
    value: 'us-east-1'

stages:
  ##############################################################################
  # Stage 1: Build, Test, and Validate
  ##############################################################################
  - stage: Build
    displayName: 'Build and Test'
    jobs:
      - job: Build
        displayName: 'Build and Test Infrastructure'
        pool:
          vmImage: 'ubuntu-latest'

        steps:
          # Setup Node.js
          - task: NodeTool@0
            inputs:
              versionSpec: '$(NODE_VERSION)'
            displayName: 'Install Node.js'

          # Install dependencies
          - script: npm ci
            displayName: 'Install CDK dependencies'
            workingDirectory: '$(Build.SourcesDirectory)'

          # Install backend dependencies
          - script: npm ci
            displayName: 'Install backend dependencies'
            workingDirectory: '$(Build.SourcesDirectory)/app/backend'

          # Install frontend dependencies
          - script: npm ci
            displayName: 'Install frontend dependencies'
            workingDirectory: '$(Build.SourcesDirectory)/app/frontend'

          # Run ESLint
          - script: npm run lint
            displayName: 'Run linting'
            workingDirectory: '$(Build.SourcesDirectory)'
            continueOnError: false

          # Run tests
          - script: npm test -- --coverage
            displayName: 'Run unit tests'
            workingDirectory: '$(Build.SourcesDirectory)'
            continueOnError: false

          # Publish test results
          - task: PublishTestResults@2
            condition: succeededOrFailed()
            inputs:
              testResultsFormat: 'JUnit'
              testResultsFiles: '**/test-results.xml'
              failTaskOnFailedTests: true
            displayName: 'Publish test results'

          # Publish code coverage
          - task: PublishCodeCoverageResults@1
            condition: succeededOrFailed()
            inputs:
              codeCoverageTool: 'Cobertura'
              summaryFileLocation: '$(Build.SourcesDirectory)/coverage/cobertura-coverage.xml'
            displayName: 'Publish code coverage'

          # CDK synth
          - script: npx cdk synth
            displayName: 'CDK synth'
            env:
              ENVIRONMENT: dev
              AWS_REGION: $(AWS_REGION)

          # Publish CDK assets
          - task: PublishBuildArtifacts@1
            inputs:
              PathtoPublish: 'cdk.out'
              ArtifactName: 'cdk-output'
            displayName: 'Publish CDK output'

  ##############################################################################
  # Stage 2: Deploy to Development Environment
  ##############################################################################
  - stage: DeployDev
    displayName: 'Deploy to Development'
    dependsOn: Build
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/develop'))
    jobs:
      - deployment: DeployDev
        displayName: 'Deploy to Dev Environment'
        environment: 'development'
        pool:
          vmImage: 'ubuntu-latest'

        strategy:
          runOnce:
            deploy:
              steps:
                # Setup Node.js
                - task: NodeTool@0
                  inputs:
                    versionSpec: '$(NODE_VERSION)'
                  displayName: 'Install Node.js'

                # Install dependencies
                - script: npm ci
                  displayName: 'Install dependencies'

                # Configure AWS credentials
                - task: AWSShellScript@1
                  inputs:
                    awsCredentials: 'aws-dev-service-connection'
                    regionName: '$(AWS_REGION)'
                    scriptType: 'inline'
                    inlineScript: |
                      echo "AWS credentials configured"
                  displayName: 'Configure AWS credentials'

                # Build and push backend Docker image
                - script: |
                    aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
                    docker build -t order-processor-backend:$(Build.BuildId) ./app/backend
                    docker tag order-processor-backend:$(Build.BuildId) $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-backend:latest
                    docker tag order-processor-backend:$(Build.BuildId) $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-backend:$(Build.BuildId)
                    docker push $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-backend:latest
                    docker push $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-backend:$(Build.BuildId)
                  displayName: 'Build and push backend image'
                  env:
                    AWS_ACCOUNT_ID: $(AWS_ACCOUNT_ID)
                    AWS_REGION: $(AWS_REGION)

                # Build and push frontend Docker image
                - script: |
                    docker build -t order-processor-frontend:$(Build.BuildId) ./app/frontend
                    docker tag order-processor-frontend:$(Build.BuildId) $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-frontend:latest
                    docker tag order-processor-frontend:$(Build.BuildId) $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-frontend:$(Build.BuildId)
                    docker push $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-frontend:latest
                    docker push $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-frontend:$(Build.BuildId)
                  displayName: 'Build and push frontend image'
                  env:
                    AWS_ACCOUNT_ID: $(AWS_ACCOUNT_ID)
                    AWS_REGION: $(AWS_REGION)

                # Deploy infrastructure with CDK
                - script: |
                    export ENVIRONMENT=dev
                    npx cdk deploy --all --require-approval never
                  displayName: 'Deploy CDK stacks'
                  env:
                    AWS_REGION: $(AWS_REGION)
                    ENVIRONMENT: dev

                # Run deployment tests
                - script: |
                    chmod +x ./scripts/test-deployment.sh
                    ./scripts/test-deployment.sh
                  displayName: 'Run deployment tests'
                  env:
                    AWS_REGION: $(AWS_REGION)

  ##############################################################################
  # Stage 3: Deploy to Production Environment
  ##############################################################################
  - stage: DeployProd
    displayName: 'Deploy to Production'
    dependsOn: Build
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployProd
        displayName: 'Deploy to Production Environment'
        environment: 'production'
        pool:
          vmImage: 'ubuntu-latest'

        strategy:
          runOnce:
            deploy:
              steps:
                # Setup Node.js
                - task: NodeTool@0
                  inputs:
                    versionSpec: '$(NODE_VERSION)'
                  displayName: 'Install Node.js'

                # Install dependencies
                - script: npm ci
                  displayName: 'Install dependencies'

                # Configure AWS credentials
                - task: AWSShellScript@1
                  inputs:
                    awsCredentials: 'aws-prod-service-connection'
                    regionName: '$(AWS_REGION)'
                    scriptType: 'inline'
                    inlineScript: |
                      echo "AWS credentials configured for production"
                  displayName: 'Configure AWS credentials'

                # Build and push backend Docker image
                - script: |
                    aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
                    docker build -t order-processor-backend:$(Build.BuildId) ./app/backend
                    docker tag order-processor-backend:$(Build.BuildId) $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-backend:prod-$(Build.BuildId)
                    docker push $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-backend:prod-$(Build.BuildId)
                  displayName: 'Build and push backend image'
                  env:
                    AWS_ACCOUNT_ID: $(AWS_ACCOUNT_ID_PROD)
                    AWS_REGION: $(AWS_REGION)

                # Build and push frontend Docker image
                - script: |
                    docker build -t order-processor-frontend:$(Build.BuildId) ./app/frontend
                    docker tag order-processor-frontend:$(Build.BuildId) $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-frontend:prod-$(Build.BuildId)
                    docker push $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/order-processor-frontend:prod-$(Build.BuildId)
                  displayName: 'Build and push frontend image'
                  env:
                    AWS_ACCOUNT_ID: $(AWS_ACCOUNT_ID_PROD)
                    AWS_REGION: $(AWS_REGION)

                # Deploy infrastructure with CDK
                - script: |
                    export ENVIRONMENT=prod
                    npx cdk deploy --all --require-approval never
                  displayName: 'Deploy CDK stacks'
                  env:
                    AWS_REGION: $(AWS_REGION)
                    ENVIRONMENT: prod

                # Run smoke tests
                - script: |
                    chmod +x ./scripts/test-deployment.sh
                    ./scripts/test-deployment.sh
                  displayName: 'Run smoke tests'
                  env:
                    AWS_REGION: $(AWS_REGION)
```

## Azure DevOps Configuration

### Service Connections

#### AWS Development Service Connection
1. Navigate to **Project Settings** → **Service connections**
2. Create new **AWS** service connection
3. Name: `aws-dev-service-connection`
4. Authentication: **Access Key**
5. Configure:
   - Access Key ID: `<dev-access-key-id>`
   - Secret Access Key: `<dev-secret-access-key>`
   - Default Region: `us-east-1`

#### AWS Production Service Connection
Same process but with production credentials:
- Name: `aws-prod-service-connection`
- Use separate IAM user with production-only permissions

### Variable Groups

#### aws-credentials (Development)
```
AWS_ACCOUNT_ID: 211125316068
AWS_REGION: us-east-1
```

#### aws-credentials-prod (Production)
```
AWS_ACCOUNT_ID_PROD: <prod-account-id>
AWS_REGION: us-east-1
```

### Environments

#### Development Environment
- Name: `development`
- Approvals: None (auto-deploy)
- Checks: None

#### Production Environment
- Name: `production`
- Approvals: **Required** (4-eyes principle)
  - Approvers: Team Lead, DevOps Engineer
  - Minimum approvers: 2
- Checks:
  - Business hours gate (Mon-Fri, 9 AM - 5 PM)
  - Deployment window (max 2 hours)

## Branch Strategy

### Git Flow Model

```
main (production)
  │
  ├── develop (development)
  │     │
  │     ├── feature/add-monitoring
  │     ├── feature/improve-scaling
  │     └── bugfix/fix-queue-processing
  │
  └── hotfix/critical-security-patch
```

### Branch Policies

**main branch:**
- Requires pull request
- Requires 2 reviewers
- Requires build validation (Build stage must pass)
- No force push
- Auto-deploy to production (with manual approval)

**develop branch:**
- Requires pull request
- Requires 1 reviewer
- Requires build validation
- Auto-deploy to dev environment

## Database Migration Strategy

### Recommended Approach: Post-Deployment Lambda

Create a dedicated Lambda function for database migrations:

```typescript
// lambda/db-migrations/index.ts
import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

export async function handler(event: any) {
  // 1. Retrieve database credentials from Secrets Manager
  // 2. Connect to Aurora PostgreSQL
  // 3. Run migrations from S3 or embedded
  // 4. Return success/failure
}
```

Deploy in CDK:
```typescript
const migrationLambda = new lambda.Function(this, 'MigrationLambda', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/db-migrations'),
  vpc: props.vpc,
  environment: {
    DB_SECRET_ARN: props.database.secret!.secretArn,
  },
});

props.database.secret!.grantRead(migrationLambda);
```

Invoke in pipeline:
```yaml
- script: |
    aws lambda invoke \
      --function-name migration-lambda \
      --payload '{"action":"migrate"}' \
      response.json
    cat response.json
  displayName: 'Run database migrations'
```

### Alternative: ECS Migration Task

Run migrations as an ECS task before application deployment:

```yaml
- script: |
    aws ecs run-task \
      --cluster order-processing-cluster \
      --task-definition migration-task:1 \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}"

    # Wait for task completion
    aws ecs wait tasks-stopped \
      --cluster order-processing-cluster \
      --tasks <task-arn>
  displayName: 'Run database migrations'
```

### Production Best Practice

For production:
1. Manual review of migration scripts
2. Dry-run in staging environment
3. Database backup before migration
4. Rollback plan documented

## Secret Management

### AWS Secrets Manager
- **Database credentials**: Auto-generated by Aurora, stored in Secrets Manager
- **Application secrets**: Manually created in Secrets Manager, referenced in CDK

### Azure DevOps
- **AWS credentials**: Stored in Service Connections (encrypted)
- **Non-AWS secrets**: Stored in Variable Groups (marked as secret)

### Runtime Access
Applications retrieve secrets at runtime using IAM task roles:

```typescript
const client = new SecretsManagerClient({ region: 'us-east-1' });
const response = await client.send(
  new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
);
const secret = JSON.parse(response.SecretString!);
```

## Cost Optimization

### Development Environment
- Use single NAT Gateway ($32/month)
- Aurora: 0.5-1 ACU ($0.12-0.24/hour)
- Stop ECS tasks when not in use
- Delete stack overnight (optional)

### Production Environment
- 3 NAT Gateways for HA ($96/month)
- Aurora: 0.5-4 ACU auto-scaling
- Reserved capacity for predictable workloads
- S3 lifecycle policies for CloudTrail logs

## Rollback Strategy

### Infrastructure Rollback
CDK CloudFormation stacks support automatic rollback on failure:
```bash
# Manual rollback to previous version
aws cloudformation update-stack \
  --stack-name dev-ApplicationStack \
  --use-previous-template
```

### Application Rollback
Update ECS service to use previous Docker image tag:
```bash
# Update task definition to use previous image
aws ecs update-service \
  --cluster order-processing-cluster \
  --service order-processor-backend \
  --task-definition backend-task-def:42  # Previous revision
```

## Monitoring Pipeline Execution

### Azure DevOps Insights
- Build success rate
- Deployment frequency
- Mean time to recovery (MTTR)
- Change failure rate

### Notifications
- **Slack/Teams integration**: Pipeline status updates
- **Email notifications**: Failed deployments, approvals required
- **SNS topics**: AWS infrastructure alerts

## Testing Strategy in CI/CD

### Build Stage
1. **Linting**: ESLint for TypeScript code quality
2. **Unit tests**: Jest for CDK stacks and application logic
3. **Snapshot tests**: CloudFormation template validation
4. **Security scanning**: npm audit, Snyk

### Deployment Stage
1. **Deployment tests**: scripts/test-deployment.sh verifies endpoints
2. **Smoke tests**: Critical user journeys
3. **Health checks**: ALB target group health

### Post-Deployment
1. **Integration tests**: E2E order processing flow
2. **Load tests**: Artillery.io or Locust
3. **Security scans**: OWASP ZAP, AWS Inspector

## Best Practices

1. **Immutable Infrastructure**: Never manually modify deployed resources
2. **Versioned Artifacts**: Tag Docker images with build IDs
3. **Blue-Green Deployments**: Consider using ECS blue-green for zero-downtime
4. **Feature Flags**: Use AWS AppConfig for gradual rollouts
5. **Audit Logging**: Enable CloudTrail for all API calls
6. **Least Privilege**: IAM roles grant only required permissions
7. **Secrets Rotation**: Rotate credentials every 90 days
8. **Backup Testing**: Regularly test database restore procedures

## Continuous Improvement

- **Weekly retrospectives**: Review pipeline failures
- **Monthly metrics review**: Track DORA metrics
- **Quarterly optimization**: Review costs and performance
- **Annual architecture review**: Evaluate new AWS services

## References

- [Azure DevOps Pipelines Documentation](https://docs.microsoft.com/en-us/azure/devops/pipelines/)
- [AWS CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [DORA Metrics](https://www.devops-research.com/research.html)
