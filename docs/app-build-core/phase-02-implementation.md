# Phase 2 — Infrastructure (IaC): Implementation Roadmap

---

## GOALS

Stand up the entire cloud infrastructure in a **reproducible, code-reviewed, environment-agnostic**
way. After this phase, any engineer can spin up a complete environment (dev, staging, prod) with
a single `terraform apply`. No ClickOps. No snowflakes.

**Outcome:** Three working environments (dev/staging/prod) with networking, compute, databases,
caches, message brokers, and CDN — all managed by Terraform.

---

## TECHNOLOGY CHOICES

| Category | Choice | Why |
|----------|--------|-----|
| **IaC Tool** | Terraform (v1.6+) | Industry standard, cloud-agnostic, massive module ecosystem |
| **Cloud Provider** | AWS | Managed Kafka (MSK), managed OpenSearch, ECS Fargate |
| **Compute** | ECS Fargate | Serverless containers — no EC2 management, auto-scaling built in |
| **Container Registry** | ECR | Native ECS integration, no cross-account auth hassle |
| **Relational DB** | RDS PostgreSQL 16 | Managed, Multi-AZ, automated backups, performance insights |
| **Cache** | ElastiCache Redis 7 | Managed clustering, failover, encryption |
| **Message Broker** | MSK (Kafka 3.5) | Managed brokers, scaling, monitoring — no ZooKeeper management |
| **Search** | OpenSearch 2.11 | AWS-managed, compatible with Elasticsearch clients |
| **CDN** | CloudFront | Native S3/ALB integration, global edge network |
| **DNS** | Route 53 | Programmatic record management, health checks |
| **WAF** | AWS WAFv2 | Integrates with CloudFront + ALB, managed rule sets |
| **Secrets** | Secrets Manager + SSM Parameter Store | Rotation support, ECS native injection |
| **State Backend** | S3 + DynamoDB | Versioned, encrypted, locking |
| **CI for IaC** | GitHub Actions + `terraform plan` on PR | Review infra changes before apply |

### Why NOT Kubernetes?

```
For a team of < 10 engineers shipping an MVP:
  ECS Fargate:
    ✅ Zero cluster management
    ✅ 15-minute setup
    ✅ Native AWS integrations
    ✅ Pay-per-task-second

  Kubernetes (EKS):
    ❌ Cluster upgrades, node management
    ❌ Service mesh complexity (Istio)
    ❌ 2-4 weeks to set up properly
    ❌ Requires dedicated platform engineer

Verdict: Start with ECS. Migrate to EKS when team > 20 or need
multi-cloud / advanced scheduling features.
```

---

## ARCHITECTURE DECISIONS

### ADR-006: Three-Tier Subnet Architecture

```
Decision: Public → Private → Data subnets across 3 AZs
  - Public:  ALB, NAT Gateway, Bastion (if needed)
  - Private: ECS tasks (all services)
  - Data:    RDS, ElastiCache, MSK, OpenSearch

Rationale: Defense in depth — data tier has zero internet access.
  Services in private subnets reach internet only via NAT.
```

### ADR-007: Single ALB Pointing to API Gateway

```
Decision: Route ALL external traffic through API Gateway (not path-based ALB routing)
Rationale:
  - Centralized auth, rate limiting, correlation ID generation
  - Fewer ALB listener rules
  - API Gateway handles internal service routing
Trade-off: API Gateway is a single point — must be horizontally scaled (3+ instances)
```

### ADR-008: Fargate Spot for Non-Critical Workloads

```
Decision: Use Fargate Spot capacity for Search Service, Notification Service
  Use standard Fargate for Order, Payment, Inventory (transaction-critical)
Rationale: 70% cost reduction for services that can tolerate brief interruptions
```

### ADR-009: Single RDS Instance Per Service (Not Aurora Serverless)

```
Decision: Provisioned RDS instances, not Aurora Serverless
Rationale:
  - Aurora Serverless v2 has minimum ACU charges even idle (~$50/month per DB)
  - Our services have predictable load patterns
  - RDS provisioned cheaper for steady workloads
When to switch: If any service becomes highly spikey (0 → 100K RPS suddenly)
```

---

## IMPLEMENTATION STEPS

### Build Order (Dependencies ↓)

```
Week 1: Foundation
──────────────────
  Step 1: Bootstrap (S3 backend + DynamoDB lock)         [Day 1]
  Step 2: Networking module (VPC, subnets, IGW, NAT)     [Day 1-2]
  Step 3: Security groups module                          [Day 2]
  Step 4: ALB module                                      [Day 3]

Week 2: Data Tier
─────────────────
  Step 5: RDS module (PostgreSQL)                         [Day 4-5]
  Step 6: ElastiCache module (Redis)                      [Day 5]
  Step 7: MSK module (Kafka)                              [Day 6-7]
  Step 8: OpenSearch module                               [Day 7]
  Step 9: S3 module (file uploads)                        [Day 7]

Week 3: Compute + Edge
──────────────────────
  Step 10: ECS cluster module                             [Day 8]
  Step 11: ECS service module (reusable)                  [Day 8-9]
  Step 12: Service discovery (Cloud Map)                  [Day 9]
  Step 13: Auto-scaling module                            [Day 10]
  Step 14: ECR repositories                               [Day 10]

Week 4: Edge + Secrets + Dev Environment
────────────────────────────────────────
  Step 15: CloudFront + WAF                               [Day 11]
  Step 16: Route 53                                       [Day 11]
  Step 17: Secrets Manager + Parameter Store              [Day 12]
  Step 18: IAM roles (task, execution, service-linked)    [Day 12]
  Step 19: Monitoring (CloudWatch dashboards + alarms)    [Day 13]
  Step 20: Compose dev environment (terraform apply)      [Day 13-14]
  Step 21: Compose staging environment                    [Day 14]
```

---

## TASK BREAKDOWN

```
Phase 2 — Infrastructure (IaC)
├── [ ] 2.1 — Bootstrap
│   ├── [ ] Create bootstrap/main.tf (S3 bucket + DynamoDB table)
│   ├── [ ] Run terraform apply for bootstrap
│   ├── [ ] Document state bucket ARN
│   └── [ ] Verify state locking works (two concurrent applies)
│
├── [ ] 2.2 — Networking Module
│   ├── [ ] Create modules/networking/main.tf
│   ├── [ ] VPC with 10.0.0.0/16 CIDR
│   ├── [ ] 3 public subnets (10.0.1-3.0/24)
│   ├── [ ] 3 private subnets (10.0.11-13.0/24)
│   ├── [ ] 3 data subnets (10.0.21-23.0/24)
│   ├── [ ] Internet Gateway
│   ├── [ ] NAT Gateway (1 for dev, 3 for prod)
│   ├── [ ] Route tables (public → IGW, private → NAT)
│   ├── [ ] VPC Flow Logs to CloudWatch
│   ├── [ ] Output VPC ID, subnet IDs
│   └── [ ] Test: verify subnets have correct routing
│
├── [ ] 2.3 — Security Groups Module
│   ├── [ ] SG: ALB (ingress 443 from 0.0.0.0/0)
│   ├── [ ] SG: ECS (ingress 3000-3009 from ALB SG only)
│   ├── [ ] SG: RDS (ingress 5432 from ECS SG only)
│   ├── [ ] SG: Redis (ingress 6379 from ECS SG only)
│   ├── [ ] SG: MSK (ingress 9092 from ECS SG only)
│   ├── [ ] SG: OpenSearch (ingress 443 from ECS SG only)
│   └── [ ] Test: verify no public access to data tier
│
├── [ ] 2.4 — ALB Module
│   ├── [ ] Create ALB in public subnets
│   ├── [ ] HTTPS listener (port 443) with ACM certificate
│   ├── [ ] HTTP → HTTPS redirect
│   ├── [ ] Default target group for API Gateway
│   ├── [ ] Health check configuration (/health)
│   ├── [ ] Access logs to S3
│   └── [ ] Output ALB DNS name, target group ARN
│
├── [ ] 2.5 — RDS Module
│   ├── [ ] Parameterized module (service_name, instance_class, etc.)
│   ├── [ ] Create 5 RDS instances (user, product, order, inventory, payment)
│   ├── [ ] Multi-AZ for staging/prod
│   ├── [ ] Encryption at rest (KMS)
│   ├── [ ] Automated backups (30-day retention for prod)
│   ├── [ ] Performance Insights enabled
│   ├── [ ] Parameter group (log slow queries > 200ms)
│   ├── [ ] Store credentials in Secrets Manager
│   └── [ ] Test: verify connectivity from ECS SG
│
├── [ ] 2.6 — ElastiCache Module
│   ├── [ ] Redis replication group
│   ├── [ ] Auth token (transit encryption)
│   ├── [ ] Automatic failover for prod
│   ├── [ ] Snapshot retention
│   └── [ ] Store auth token in Secrets Manager
│
├── [ ] 2.7 — MSK Module
│   ├── [ ] Kafka cluster (3 brokers dev, 6 prod)
│   ├── [ ] TLS encryption (in-transit + at-rest)
│   ├── [ ] Custom configuration (auto.create.topics=false, replication=3)
│   ├── [ ] CloudWatch logging
│   ├── [ ] Output bootstrap server endpoints
│   ├── [ ] Create topics via Kafka admin (post-deploy script):
│   │   ├── product.events (6 partitions)
│   │   ├── order.events (12 partitions)
│   │   ├── inventory.events (6 partitions)
│   │   ├── payment.events (6 partitions)
│   │   ├── user.events (3 partitions)
│   │   ├── cart.events (3 partitions)
│   │   └── notification.events (3 partitions)
│   └── [ ] Create DLQ topics for each main topic
│
├── [ ] 2.8 — OpenSearch Module
│   ├── [ ] Domain creation (r6g.large for prod)
│   ├── [ ] VPC access (data subnets)
│   ├── [ ] Encryption at rest + node-to-node
│   ├── [ ] 3-AZ zone awareness for prod
│   └── [ ] Fine-grained access control
│
├── [ ] 2.9 — S3 Module
│   ├── [ ] Upload bucket with CORS
│   ├── [ ] Versioning enabled
│   ├── [ ] Lifecycle rule (IA after 30 days)
│   ├── [ ] Encryption (SSE-S3)
│   └── [ ] Block public access
│
├── [ ] 2.10 — ECS Cluster + Service Module
│   ├── [ ] ECS cluster with Container Insights
│   ├── [ ] Capacity providers (FARGATE + FARGATE_SPOT)
│   ├── [ ] Reusable ecs-service module
│   │   ├── Task definition (CPU, memory, env vars, secrets)
│   │   ├── Service (desired count, deployment config)
│   │   ├── Target group registration
│   │   ├── Service discovery (Cloud Map)
│   │   └── Auto-scaling policies
│   ├── [ ] Create 10 ECR repositories
│   └── [ ] Test with a hello-world container
│
├── [ ] 2.11 — CloudFront + WAF
│   ├── [ ] Distribution with ALB origin
│   ├── [ ] S3 origin for /uploads/*
│   ├── [ ] Custom domain + ACM cert
│   ├── [ ] WAF rules (rate limit, SQLi, XSS, Common)
│   └── [ ] Geo-restriction (if applicable)
│
├── [ ] 2.12 — Route 53
│   ├── [ ] Hosted zone for domain
│   ├── [ ] A/AAAA alias to CloudFront
│   ├── [ ] Health checks for ALB
│   └── [ ] Failover routing (future DR)
│
├── [ ] 2.13 — Secrets + Parameters
│   ├── [ ] JWT secret in Secrets Manager
│   ├── [ ] DB credentials in Secrets Manager (per service)
│   ├── [ ] Redis auth token in Secrets Manager
│   ├── [ ] Kafka brokers in Parameter Store
│   ├── [ ] Redis endpoint in Parameter Store
│   ├── [ ] OpenSearch endpoint in Parameter Store
│   └── [ ] Document parameter naming convention
│
├── [ ] 2.14 — IAM Roles
│   ├── [ ] ECS task execution role (pull ECR, read secrets)
│   ├── [ ] ECS task role (S3 access, SES, SSM, etc.)
│   ├── [ ] CodeDeploy role
│   └── [ ] Monitoring role (Enhanced Monitoring for RDS)
│
├── [ ] 2.15 — Monitoring Foundation
│   ├── [ ] CloudWatch log groups per service
│   ├── [ ] Basic alarms (CPU, memory, RDS connections)
│   ├── [ ] SNS topics for alarm notifications
│   └── [ ] Basic CloudWatch dashboard
│
└── [ ] 2.16 — Environment Deployment
    ├── [ ] Compose environments/dev/main.tf
    ├── [ ] Apply dev environment (terraform apply)
    ├── [ ] Verify all resources created
    ├── [ ] Compose environments/staging/main.tf
    ├── [ ] Compose environments/prod/main.tf (plan only, apply later)
    └── [ ] Document all resource ARNs and endpoints
```

---

## DEPENDENCIES

```
Phase 2 depends on:
  └── Phase 1 (service list, database choices, technology decisions)

Internal dependencies (build order):
  2.1 Bootstrap          → required by ALL other steps (remote state)
  2.2 Networking         → required by 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
  2.3 Security Groups    → required by 2.4, 2.5, 2.6, 2.7, 2.8, 2.10
  2.4 ALB                → required by 2.10 (target groups), 2.11 (CloudFront)
  2.5 RDS                → required by 2.13 (secrets for DB creds)
  2.6 ElastiCache        → required by 2.13
  2.7 MSK                → required by 2.13
  2.10 ECS               → required by 2.14 (IAM roles reference tasks)
  2.14 IAM               → required by 2.10 (task/execution roles)
  ↑ Circular: create IAM roles first with placeholder, then reference in ECS

  Parallel wave:
    Wave 1: 2.1 Bootstrap
    Wave 2: 2.2 Networking (depends on 2.1)
    Wave 3: 2.3 SGs + 2.14 IAM (depends on 2.2)
    Wave 4: 2.4 ALB + 2.5 RDS + 2.6 Redis + 2.7 MSK + 2.8 OS + 2.9 S3 (parallel)
    Wave 5: 2.10 ECS + 2.12 Route53 (depends on 2.4, 2.14)
    Wave 6: 2.11 CloudFront + 2.13 Secrets + 2.15 Monitoring
    Wave 7: 2.16 Environment Deployment
```

---

## DELIVERABLES

| # | Deliverable | Verification |
|---|-------------|-------------|
| D1 | Terraform modules for all infrastructure components | `terraform plan` succeeds with no errors |
| D2 | Dev environment running with all resources | All resources visible in AWS Console |
| D3 | Staging environment running | `curl` to ALB endpoint returns response |
| D4 | All secrets stored in Secrets Manager | Secrets accessible from ECS tasks |
| D5 | Kafka topics created with correct partitioning | Kafka admin shows all topics |
| D6 | RDS instances accessible from ECS security group | `psql` from ECS task connects |
| D7 | VPC flow logs capturing traffic | Logs visible in CloudWatch |
| D8 | WAF blocking SQLi and rate limiting | Test with `curl` payloads |
| D9 | Documentation of all resource endpoints/ARNs | Markdown with all outputs listed |

---

## COMMON MISTAKES

> [!CAUTION]
> **1. Applying prod Terraform before testing in dev.** Always follow: dev → staging → prod.
> Never `terraform apply` to prod without validating the exact same modules in dev first.
>
> **2. Forgetting NAT Gateway costs.** NAT Gateway costs ~$30/month per AZ + data transfer.
> In dev, use a single NAT. In prod, use one per AZ for availability.
>
> **3. Security groups that are too open.** The most common mistake: setting ECS ingress to
> `0.0.0.0/0` "just for testing" and forgetting to fix it. Use SG-to-SG references always.
>
> **4. No Terraform state locking.** Without DynamoDB locking, two engineers running
> `terraform apply` simultaneously will corrupt the state file.
>
> **5. Hardcoded AMIs or account IDs.** Use data sources (`data "aws_caller_identity"`) and
> variables. Hardcoded values break when you switch accounts or regions.
>
> **6. Creating Kafka topics manually.** Use a post-deploy script or a Terraform Kafka provider.
> Manual topic creation is not reproducible and gets forgotten in new environments.
>
> **7. Over-provisioning dev.** Running `db.r6g.xlarge` in dev because "it's the same as prod"
> wastes ~$500/month. Dev should use `t3.micro`/`t3.small` for everything.

---

> **Next →** [Phase 3 — Platform Core Implementation](./phase-03-implementation.md)
