# Quick Reference - Order Processing Infrastructure

## Stack Status
All stacks: CREATE_COMPLETE

## Essential Connection Details

### VPC
```
VPC ID: vpc-0f298fe99203d06e4
Region: us-east-1
```

### SQS Queue
```
Queue URL: https://sqs.us-east-1.amazonaws.com/211125316068/orders-queue
Queue ARN: arn:aws:sqs:us-east-1:211125316068:orders-queue
DLQ URL: https://sqs.us-east-1.amazonaws.com/211125316068/orders-dlq
```

### Aurora PostgreSQL Database
```
Endpoint: dev-databasestack-auroracluster23d869c0-ghlcteqwv0it.cluster-c83ki0mg4t3a.us-east-1.rds.amazonaws.com
Read Endpoint: dev-databasestack-auroracluster23d869c0-ghlcteqwv0it.cluster-ro-c83ki0mg4t3a.us-east-1.rds.amazonaws.com
Database: orders
Port: 5432
Version: 15.8
Secret ARN: arn:aws:secretsmanager:us-east-1:211125316068:secret:devDatabaseStackAuroraClust-pWuZkU5xScw9-1Jrc22
```

### Lambda Producer
```
Function ARN: arn:aws:lambda:us-east-1:211125316068:function:dev-MessagingStack-OrderProducer72B63B2C-c1EgD7lcsZ0x
Log Group: /aws/lambda/dev-MessagingStack-OrderProducer72B63B2C-c1EgD7lcsZ0x
```

## Useful Commands

### Get Database Credentials
```bash
aws secretsmanager get-secret-value \
  --secret-id arn:aws:secretsmanager:us-east-1:211125316068:secret:devDatabaseStackAuroraClust-pWuZkU5xScw9-1Jrc22 \
  --query SecretString --output text | jq .
```

### Check Queue Depth
```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/211125316068/orders-queue \
  --attribute-names ApproximateNumberOfMessages
```

### View Lambda Logs
```bash
aws logs tail /aws/lambda/dev-MessagingStack-OrderProducer72B63B2C-c1EgD7lcsZ0x --follow
```

### Invoke Producer Lambda
```bash
aws lambda invoke \
  --function-name arn:aws:lambda:us-east-1:211125316068:function:dev-MessagingStack-OrderProducer72B63B2C-c1EgD7lcsZ0x \
  response.json
```

### List All Stacks
```bash
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE
```

## Next Stack to Deploy
ApplicationStack - requires all outputs above
