# Phase 04 — Infrastructure (IaC)

---

## 1. Overview

Stand up the entire cloud infrastructure using Terraform. Every environment (dev/staging/prod)
is reproducible with `terraform apply`. No ClickOps. No snowflakes.

## 2. Goals

- All infrastructure defined as code and code-reviewed
- Three environments: dev, staging, prod
- Security: defense-in-depth (public → private → data subnets)
- Cost-optimized: right-sized per environment

## 3. Architecture Design

See [Architecture Diagrams](../global/architecture-diagrams.md) — Network Architecture section.

**Three-tier subnet architecture:**
- Public: ALB, NAT Gateway
- Private: ECS Fargate tasks (all services)
- Data: RDS, ElastiCache, MSK, OpenSearch (zero internet access)

## 4. Technology Choices

| Component | Technology | Why |
|-----------|-----------|-----|
| IaC | Terraform 1.6+ | Cloud-agnostic, module ecosystem |
| Compute | ECS Fargate | Serverless containers, no EC2 |
| DB | RDS PostgreSQL 16 | Managed, Multi-AZ, automated backups |
| Cache | ElastiCache Redis 7 | Managed clustering, failover |
| Broker | MSK Kafka 3.5 | Managed Kafka, zero ZooKeeper |
| Search | OpenSearch 2.11 | Managed, VPC access |
| CDN | CloudFront + WAF | Global edge, security rules |
| DNS | Route 53 | Programmatic, health checks |
| Secrets | Secrets Manager + SSM | Rotation, ECS injection |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-013 | 3-tier subnets | Defense in depth — data has no internet |
| ADR-014 | Single ALB → API Gateway | Centralized auth/rate-limit, fewer rules |
| ADR-015 | Fargate Spot for non-critical | 70% cost reduction for tolerant services |
| ADR-016 | Provisioned RDS (not Aurora) | Cheaper for steady workloads |

## 6. Data Flow / Request Flow

See [Infrastructure Modules](../global/infrastructure-modules.md) for module dependency graph.

## 7. Components Involved

See [Infrastructure Modules](../global/infrastructure-modules.md) for complete module inventory.

17 Terraform modules covering networking, compute, data stores, edge, secrets, and monitoring.

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Bootstrap (S3+DDB), Networking, Security Groups, ALB |
| Week 2 | RDS, ElastiCache, MSK, OpenSearch, S3 |
| Week 3 | ECS Cluster, ECS Service module, Service Discovery, ECR |
| Week 4 | CloudFront, WAF, Route53, Secrets, IAM, Monitoring, Deploy dev+staging |

## 9. Tasks Checklist

```
- [ ] Bootstrap: S3 state bucket + DynamoDB lock table
- [ ] Networking: VPC, 9 subnets, IGW, NAT, route tables, flow logs
- [ ] Security Groups: ALB, ECS, RDS, Redis, MSK, OpenSearch
- [ ] ALB: HTTPS listener, ACM cert, health checks, access logs
- [ ] RDS: 5 instances, Multi-AZ (staging/prod), encryption, backups
- [ ] ElastiCache: Redis cluster, auth, failover
- [ ] MSK: Kafka cluster, 7 topics + 7 DLQ topics
- [ ] OpenSearch: Domain, VPC access, encryption
- [ ] S3: Upload bucket, CORS, lifecycle
- [ ] ECS: Cluster, reusable service module, 10 ECR repos
- [ ] CloudFront + WAF: CDN, managed rules
- [ ] Route53: DNS records, health checks
- [ ] Secrets Manager: JWT secret, DB creds, Redis auth
- [ ] IAM: Task execution role, task role, CodeDeploy role
- [ ] Monitoring: CloudWatch log groups, alarms, dashboards
- [ ] Dev environment deployed and verified
- [ ] Staging environment deployed and verified
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| All Terraform modules | `terraform plan` succeeds |
| Dev + Staging running | Resources visible in AWS Console |
| All secrets stored | ECS tasks can read secrets |
| Kafka topics created | kafka-topics.sh --list shows all |
| VPC flow logs active | Logs in CloudWatch |

## 11. Dependencies

- Phase 01 (service list determines how many RDS/ECS instances)
- Phase 02 (architecture determines networking topology)
- Phase 03 (technology choices determine which AWS services)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Spiraling AWS costs in dev | Right-size dev (t3.micro), scheduled shutdown |
| Terraform state corruption | DynamoDB locking, S3 versioning |
| Security misconfigurations | Security group reviews, no 0.0.0.0/0 to data |

## 13. Common Mistakes

- Applying prod before testing in dev → always: dev → staging → prod
- Forgetting NAT Gateway costs (~$30/month/AZ)
- Security groups too open "just for testing"
- No Terraform state locking
- Hardcoded AMIs or account IDs
- Over-provisioning dev ($500/month wasted)

## 14. Best Practices

- Use `terraform plan` on PRs, require review before `apply`
- Tag every resource with environment, service, cost-center
- Use data sources over hardcoded values
- One module per concern (networking, security, compute)
