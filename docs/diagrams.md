# Architecture & Flow Diagrams

The diagrams below capture the infrastructure, application flow, and CI/CD path for the order processing platform.

## 1) High-Level Infrastructure (AWS Official Icons)

![Order Processing Infrastructure](architecture-high-level.png)

Generated with AWS official icons (diagrams + Graphviz) to ensure reliable rendering.

## 2) Application Logical Flow (Order Lifecycle)

```mermaid
sequenceDiagram
    autonumber
    participant User as User/Browser
    participant ALB as Application LB
    participant API as ECS API Service
    participant DB as Aurora PostgreSQL
    participant EB as EventBridge
    participant Lambda as Order Producer Lambda
    participant SQS as Orders Queue
    participant Worker as ECS SQS Worker

    EB->>Lambda: Scheduled trigger (every 5 min)
    Lambda->>SQS: Send generated order message
    SQS-->>Worker: Poll message
    Worker->>Worker: Validate & enrich order
    Worker->>DB: Persist order record
    User->>ALB: GET /api/orders
    ALB->>API: Forward request
    API->>DB: Query recent orders
    DB-->>API: Order rows
    API-->>User: JSON response / rendered dashboard
```

## 3) CI/CD Flow (Azure DevOps)

```mermaid
flowchart TB
    Dev([Developer commit/PR]) --> Build[Build: lint, unit tests, coverage, CDK synth, docker build]
    Build --> Artifacts[Publish artifacts (cdk.out, test results)]

    Build --> DevCheck{Branch == develop?}
    DevCheck -->|Yes| DeployDev[Deploy to dev (ECR push + CDK deploy)]
    DevCheck -->|No| SkipDev[Skip dev deploy]

    Build --> ProdCheck{Branch == main?}
    ProdCheck -->|Yes| Approval[[Manual approval]]
    ProdCheck -->|No| SkipProd[Skip prod deploy]
    Approval --> DeployProd[Deploy to prod (ECR push + CDK deploy)]

    DeployDev --> Mon[(Monitor: CloudWatch/SNS alerts)]
    DeployProd --> Mon
```
