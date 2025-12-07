# Order Processing Infrastructure

AWS order processing system built with Infrastructure as Code using AWS CDK. This project demonstrates cloud architecture, DevOps practices, and observability for event-driven order processing.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Documentation](#documentation)
- [Cost Estimates](#cost-estimates)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

This infrastructure implements an event-driven order processing system with the following components:

![Infrastructure Diagram](./diagrams/infrastructure-diagram.png)

### Components

- **Multi-AZ VPC** - 3 Availability Zones with public/private subnet isolation
- **Application Load Balancer** - HTTP routing to frontend and backend services
- **ECS Fargate** - Containerized backend (Express API + SQS worker) and frontend (React SPA)
- **Aurora Serverless v2** - PostgreSQL database with automatic capacity scaling (0.5-1 ACU)
- **SQS + Dead Letter Queue** - Reliable message processing with automatic retries
- **Lambda Order Producer** - Generates sample orders every 5 minutes via EventBridge
- **CloudWatch** - Centralized logging for all services (ALB, ECS, Aurora, Lambda)

### Data Flow

1. EventBridge triggers Lambda every 5 minutes to generate sample orders
2. Lambda sends orders to SQS queue
3. ECS worker consumes messages from SQS and processes orders
4. Processed orders stored in Aurora PostgreSQL
5. Backend API provides RESTful endpoints for order retrieval
6. React frontend displays orders via API calls through ALB

### Application Flow Diagram

```mermaid
flowchart TB
    %% Styling
    classDef awsService fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#232F3E
    classDef dataStore fill:#3B48CC,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef deadLetter fill:#D13212,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef user fill:#7AA116,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef secrets fill:#DD344C,stroke:#232F3E,stroke-width:2px,color:#fff

    %% User Layer
    User([User/Browser]):::user

    %% Event-Driven Order Generation
    EventBridge[EventBridge Rule<br/>5 minute trigger]:::awsService
    OrderGenLambda[Order Generator Lambda<br/>Generates random orders]:::awsService

    %% Messaging Layer
    SQS[SQS Queue<br/>Order Queue]:::awsService
    DLQ[Dead Letter Queue<br/>Failed Messages]:::deadLetter

    %% Application Load Balancer
    ALB[Application Load Balancer<br/>Path-based routing]:::awsService

    %% ECS Services
    subgraph ECS_Cluster[ECS Cluster]
        Frontend[Frontend ECS Service<br/>React/Web UI]:::awsService
        Backend[Backend ECS Service<br/>Order Processing API]:::awsService
    end

    %% Data & Secrets
    Aurora[(Aurora PostgreSQL<br/>Order Database)]:::dataStore
    SecretsManager[Secrets Manager<br/>DB Credentials]:::secrets

    %% Flow Connections
    EventBridge -->|Triggers every 5 min| OrderGenLambda
    OrderGenLambda -->|Sends order messages| SQS

    SQS -->|Polls for messages| Backend
    SQS -.->|After 3 retries| DLQ

    Backend -->|Reads credentials| SecretsManager
    Backend -->|Inserts processed orders| Aurora

    User -->|HTTP/HTTPS requests| ALB
    ALB -->|/* requests| Frontend
    ALB -->|/api/* requests| Backend

    Frontend -->|API calls via /api/*| ALB

    %% Notes
    note1[Retry Policy: Max 3 attempts<br/>Visibility timeout: 30s]
    note2[Path Rules:<br/>/* → Frontend<br/>/api/* → Backend]

    SQS -.-> note1
    ALB -.-> note2

    style note1 fill:#FFF3CD,stroke:#856404,stroke-width:1px
    style note2 fill:#FFF3CD,stroke:#856404,stroke-width:1px
    style ECS_Cluster fill:#E8F4F8,stroke:#00A4BD,stroke-width:2px
```

## Key Features

- **Multi-AZ High Availability** - Resources span 3 Availability Zones
- **Auto-Scaling** - ECS services scale on CPU (80%) and memory (85%) thresholds
- **Serverless Database** - Aurora Serverless v2 (0.5-1 ACU) with automatic scaling
- **Private Architecture** - ECS and database in private subnets with no public IPs
- **Infrastructure as Code** - AWS CDK (TypeScript) with CloudFormation deployment
- **Automated Testing** - 59 unit tests covering all infrastructure stacks
- **CI/CD Pipeline** - GitHub Actions with automated deployment to dev environment
- **Comprehensive Logging** - CloudWatch Logs for ALB, ECS, Aurora, Lambda, and VPC Flow Logs
- **Security** - IAM least privilege, Secrets Manager, encryption at rest/transit, WAF rate limiting
- **Observability** - CloudWatch metrics, WAF alarms, structured logging

See [docs/observability-security.md](./docs/observability-security.md) for detailed monitoring and security architecture.
See [docs/cicd-strategy.md](./docs/cicd-strategy.md) for complete CI/CD pipeline documentation.

## Quick Start

### Prerequisites

- **Node.js** >= 20.x ([Download](https://nodejs.org/))
- **Docker** >= 24.x ([Download](https://www.docker.com/))
- **AWS CLI** >= 2.x ([Install Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
- **AWS Account** with Administrator or PowerUser permissions
- **Git** for version control

### Deployment Steps

**1. Clone and Install**

```bash
git clone <repository-url>
cd order-processing-infrastructure
npm install
```

**2. Configure AWS Credentials**

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
```

**3. Bootstrap CDK** (First time only per AWS account/region)

```bash
# Get your AWS account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Bootstrap CDK
npx cdk bootstrap aws://${AWS_ACCOUNT_ID}/us-east-1
```

**4. Create ECR Repositories and Build Docker Images**

```bash
# Create ECR repositories
aws ecr create-repository --repository-name order-processor-backend --region us-east-1
aws ecr create-repository --repository-name order-processor-frontend --region us-east-1

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# Build and push backend image
cd app/backend
docker build --platform linux/amd64 -t order-processor-backend:latest .
docker tag order-processor-backend:latest ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/order-processor-backend:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/order-processor-backend:latest

# Build and push frontend image
cd ../frontend
docker build --platform linux/amd64 -t order-processor-frontend:latest .
docker tag order-processor-frontend:latest ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/order-processor-frontend:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/order-processor-frontend:latest

# Return to root directory
cd ../..
```

**5. Deploy Infrastructure**

```bash
# Deploy all stacks (takes ~15-20 minutes)
npx cdk deploy --all --require-approval never
```

The deployment creates 5 stacks in this order:
1. `dev-NetworkStack` - VPC, subnets, NAT gateway, security groups
2. `dev-MessagingStack` - SQS queues, Lambda order producer
3. `dev-DatabaseStack` - Aurora Serverless v2 PostgreSQL cluster
4. `dev-ApplicationStack` - ECS cluster, services, ALB
5. `dev-WafStack` - WAF with rate limiting rules

**6. Verify Deployment**

```bash
# Get ALB URL from stack outputs
aws cloudformation describe-stacks \
  --stack-name dev-ApplicationStack \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerURL`].OutputValue' \
  --output text

# Test health endpoint
curl http://<ALB-URL>/health

# View orders (wait 5 minutes for Lambda to generate first orders)
curl http://<ALB-URL>/api/orders
```

### Cleanup

To avoid ongoing AWS charges, destroy all resources:

```bash
npx cdk destroy --all
```

This removes all infrastructure except ECR repositories (which must be deleted manually if they contain images).

## Project Structure

```
order-processing-infrastructure/
├── README.md                                    # This file
├── bin/
│   └── order-processing-infrastructure.ts       # CDK app entry point
├── lib/
│   ├── config/
│   │   └── environment-config.ts                # Environment configurations
│   └── stacks/
│       ├── network-stack.ts                     # VPC, Subnets, NAT Gateways
│       ├── database-stack.ts                    # Aurora Serverless v2
│       ├── messaging-stack.ts                   # SQS + Lambda Producer
│       ├── application-stack.ts                 # ECS + ALB
│       └── waf-stack.ts                         # AWS WAF configuration
├── app/
│   ├── backend/                                 # Express API + SQS Worker
│   │   ├── src/
│   │   │   ├── routes/                          # API route handlers
│   │   │   ├── models/                          # Data models
│   │   │   ├── api-server.ts                    # Express API server
│   │   │   ├── sqs-handler.ts                   # SQS message processor
│   │   │   ├── database.ts                      # Database connection
│   │   │   └── index.ts                         # Main entry point
│   │   ├── Dockerfile
│   │   └── package.json
│   └── frontend/                                # React Dashboard
│       ├── src/
│       │   ├── components/                      # React components
│       │   ├── services/                        # API service layer
│       │   ├── App.tsx                          # Main app component
│       │   └── main.tsx                         # Entry point
│       ├── Dockerfile
│       ├── nginx.conf                           # Nginx configuration
│       └── package.json
├── lambda/
│   └── order-producer/                          # Order Generation Lambda
│       ├── index.py                             # Lambda function code
│       └── requirements.txt                     # Python dependencies
├── test/
│   └── stacks/                                  # CDK unit tests
│       ├── network-stack.test.ts
│       ├── database-stack.test.ts
│       ├── messaging-stack.test.ts
│       └── application-stack.test.ts
├── diagrams/                                    # Architecture diagrams
│   ├── infrastructure-diagram.png               # Infrastructure overview
│   ├── application-flow.mmd                     # Application flow diagram
│   └── cicd-pipeline-flow.mmd                   # CI/CD pipeline flow
├── docs/
│   ├── cicd-strategy.md                         # Azure DevOps pipeline guide
│   ├── observability-security.md                # Monitoring & security
│   ├── unit-tests-summary.md                    # Comprehensive test documentation
│   ├── diagrams.md                              # Diagram documentation
│   └── quick-reference.md                       # Quick reference guide
├── scripts/
│   ├── diagrams/                                # Diagram generation scripts
│   └── test-deployment.sh                       # E2E test script
├── .github/
│   └── workflows/                               # GitHub Actions workflows
├── cdk.json                                     # CDK configuration
├── jest.config.js                               # Jest test configuration
├── package.json                                 # Node.js dependencies
└── tsconfig.json                                # TypeScript configuration
```

## Testing

### Unit Tests

Run all 59 infrastructure unit tests:

```bash
npm test                    # Run all tests
npm test -- --coverage      # With coverage report
```

**Test Coverage:**
- NetworkStack: 9 tests
- DatabaseStack: 11 tests
- MessagingStack: 14 tests
- ApplicationStack: 25 tests

See [docs/unit-tests-summary.md](./docs/unit-tests-summary.md) for detailed documentation.

### API Testing

```bash
# Get ALB URL
ALB_URL=$(aws cloudformation describe-stacks \
  --stack-name dev-ApplicationStack \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerURL`].OutputValue' \
  --output text)

# Test health endpoint
curl http://${ALB_URL}/health

# Get orders
curl http://${ALB_URL}/api/orders

# Create order
curl -X POST http://${ALB_URL}/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerId":"123","items":["item1"],"total":99.99}'
```

### CloudWatch Logs

```bash
# View service logs
aws logs tail /aws/ecs/dev/backend --follow
aws logs tail /aws/ecs/dev/frontend --follow
aws logs tail /aws/lambda/dev-MessagingStack-OrderProducer --follow
```

## Documentation

- **[CI/CD Strategy](./docs/cicd-strategy.md)** - GitHub Actions and Azure DevOps pipeline documentation
- **[Observability & Security](./docs/observability-security.md)** - Monitoring, logging, and security architecture
- **[Unit Tests Summary](./docs/unit-tests-summary.md)** - Complete test documentation and results

### API Endpoints

**Base URL:** `http://<ALB-URL>`

- `GET /health` - Health check
- `GET /api/orders` - List all orders
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order by ID
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order

## Cost Estimates

**Development Environment:** ~$78-108/month

- NAT Gateway (1 AZ): $32/month
- Aurora Serverless v2 (0.5-1 ACU): $36-72/month
- ECS Fargate (minimal): $15-20/month
- Application Load Balancer: $16/month
- SQS + Lambda: Negligible (free tier)
- CloudWatch Logs (7-day retention): $5-10/month

**Cost Optimization:**
- Run `npx cdk destroy --all` when not in use to avoid charges
- NAT Gateway is the primary cost driver ($32/month continuous)
- Aurora scales to 0.5 ACU minimum when idle

## Troubleshooting

### Common Issues

**ECS Tasks Not Starting:**
```bash
# Check service events and logs
aws ecs describe-services --cluster order-processing-cluster --services order-processor-backend
aws logs tail /aws/ecs/dev/backend --since 10m
```

**Database Connection Failures:**
```bash
# Check Aurora cluster status
aws rds describe-db-clusters --db-cluster-identifier dev-databasestack-auroracluster

# Verify security groups allow ECS → Aurora on port 5432
aws ec2 describe-security-groups --filters "Name=group-name,Values=*database*"
```

**Health Check Failures:**
```bash
# Check target group health
aws elbv2 describe-target-health --target-group-arn <target-group-arn>

# Test endpoint directly
curl http://<ALB-URL>/health
```

**Debugging Tips:**
1. Check CloudWatch Logs for error messages
2. Review CloudFormation stack events
3. Verify Docker images exist in ECR with `latest` tag
4. Ensure AWS credentials have required permissions
5. Confirm security group rules allow necessary traffic

---

**Technology Stack:** AWS CDK (TypeScript) · Node.js/Express · React · Aurora Serverless v2 · ECS Fargate · SQS · Lambda

**CI/CD:** GitHub Actions (primary) · Azure DevOps (alternative)
