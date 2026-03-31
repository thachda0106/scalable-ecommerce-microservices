# Infrastructure Modules

> **Purpose:** Reference for every Terraform module — inputs, outputs, dependencies, and per-environment sizing.

---

## Module Inventory

| Module | Path | Purpose | Dependencies |
|--------|------|---------|-------------|
| Bootstrap | `terraform/bootstrap/` | S3 state bucket + DynamoDB lock | None |
| Networking | `terraform/modules/networking/` | VPC, subnets, IGW, NAT, routes | Bootstrap |
| Security Groups | `terraform/modules/security-groups/` | Layered SGs (ALB → ECS → Data) | Networking |
| ALB | `terraform/modules/alb/` | Load balancer + HTTPS listener | Networking, SGs |
| ECS Cluster | `terraform/modules/ecs-cluster/` | Fargate cluster + capacity providers | Networking |
| ECS Service | `terraform/modules/ecs-service/` | Per-service task def + auto-scaling | ECS Cluster, ALB, IAM |
| RDS | `terraform/modules/rds/` | PostgreSQL per service | Networking, SGs |
| ElastiCache | `terraform/modules/elasticache/` | Redis cluster | Networking, SGs |
| MSK | `terraform/modules/msk/` | Kafka cluster | Networking, SGs |
| OpenSearch | `terraform/modules/opensearch/` | Search domain | Networking, SGs |
| S3 | `terraform/modules/s3/` | File upload bucket | None |
| CloudFront | `terraform/modules/cloudfront/` | CDN + WAF | ALB, S3 |
| Route53 | `terraform/modules/route53/` | DNS records | CloudFront |
| Secrets | `terraform/modules/secrets/` | Secrets Manager + SSM | None |
| IAM | `terraform/modules/iam/` | Task/execution roles | None |
| ECR | `terraform/modules/ecr/` | Container registries | None |
| Monitoring | `terraform/modules/monitoring/` | CloudWatch dashboards + alarms | All services |

## Build Order

```
Wave 1: Bootstrap
Wave 2: Networking (depends on Bootstrap)
Wave 3: Security Groups + IAM (depends on Networking)
Wave 4: ALB + RDS + ElastiCache + MSK + OpenSearch + S3 + ECR (parallel)
Wave 5: ECS Cluster + Services (depends on ALB, IAM)
Wave 6: CloudFront + Route53 + Secrets + Monitoring
```

## Environment Sizing

| Resource | Dev | Staging | Prod |
|----------|-----|---------|------|
| NAT Gateways | 1 | 1 | 3 (per AZ) |
| ECS per service | 1 task, 256 CPU/512 MB | 2 tasks, 512/1024 | 3+ tasks, 1024/2048 |
| RDS instances | db.t3.micro | db.t3.medium | db.r6g.large, Multi-AZ |
| Redis | cache.t3.micro, single | cache.t3.small | cache.r6g.large, cluster |
| MSK brokers | 2, kafka.t3.small | 3, kafka.m5.large | 6, kafka.m5.xlarge |
| OpenSearch | t3.small.search, 1 node | r6g.large, 2 nodes | r6g.xlarge, 3 nodes |
