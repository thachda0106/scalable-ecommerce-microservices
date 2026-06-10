# Terraform Infrastructure — Deep Dive

> **Target**: `terraform/` — 44 files across bootstrap, 3 environments, and 11 modules.
> **Audience**: Developer who has never read this codebase.
> **Scope**: Every module, every variable, every design decision.

---

## 1. OVERVIEW TABLE

| Name | Path | One-Sentence Role |
|------|------|-------------------|
| `bootstrap` | `terraform/bootstrap/main.tf` | One-time setup: creates the S3 state bucket and DynamoDB lock table shared by all environments |
| `iam` | `terraform/modules/iam/` | Creates 4 IAM roles: ECS execution, ECS task, OpenSearch access, VPC Flow Logs |
| `vpc` | `terraform/modules/vpc/` | VPC with 3 AZs, public/private subnets, one NAT GW per AZ, per-AZ private route tables, flow logs |
| `alb` | `terraform/modules/alb/` | Public ALB with ACM cert (DNS-validated, wildcard SAN), HTTP→HTTPS 301 redirect, access log S3 bucket |
| `ecs_cluster` | `terraform/modules/ecs_cluster/` | ECS Fargate cluster + FARGATE_SPOT capacity provider + shared reference security group |
| `rds` | `terraform/modules/rds/` | Aurora Serverless v2 PostgreSQL cluster, managed passwords, SG restricts ingress to ECS tasks only |
| `elasticache` | `terraform/modules/elasticache/` | Redis cluster-mode replication group, encrypted transit + rest, AUTH token, slow-log delivery |
| `msk` | `terraform/modules/msk/` | MSK Kafka cluster, TLS-only client-broker encryption, SASL/SCRAM auth, broker logs to CloudWatch |
| `opensearch` | `terraform/modules/opensearch/` | OpenSearch 2.11 domain, VPC-only, HTTPS-enforced, IAM master user, fine-grained access control |
| `microservice_base` | `terraform/modules/microservice_base/` | ECS Fargate service + task definition + target group + ALB listener rule + auto-scaling + alarms |
| `observability` | `terraform/modules/observability/` | SNS alarm topic, ALB 5xx/4xx/latency alarms, RDS CPU alarms, MSK under-replication alarms, CloudWatch dashboard |
| `secrets` | `terraform/modules/secrets/` | Optional AWS Secrets Manager entries for external application secrets |
| `dev` | `terraform/environments/dev/` | Dev root config: wires all modules with dev-sized resources, non-overlapping 10.0.0.0/16 CIDR |
| `staging` | `terraform/environments/staging/` | Staging root config: mid-tier sizing, 10.1.0.0/16 CIDR, 7-day backups |
| `prod` | `terraform/environments/prod/` | Production root config: deletion protection, 30-day backups, 10.2.0.0/16 CIDR, tighter alarm thresholds |

---

## 2. DECLARATIVE KNOWLEDGE

### The Problem

Managing AWS infrastructure for a multi-service ecommerce platform across three environments (dev, staging, prod) creates several coordination challenges:

```
                 ┌────────────┐   ┌────────────┐   ┌────────────┐
                 │    DEV     │   │  STAGING   │   │    PROD    │
                 │ 10.0.0.0/16│   │ 10.1.0.0/16│   │ 10.2.0.0/16│
                 └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
                       │                │                │
                       ▼                ▼                ▼
         ┌──────────────────────────────────────────────────────┐
         │              11 Shared Terraform Modules             │
         │  (IAM, VPC, ALB, ECS, RDS, Redis, MSK, OpenSearch…)  │
         └──────────────────────┬───────────────────────────────┘
                                │
                                ▼
              ┌─────────────────────────────────┐
              │    S3 Remote State + DynamoDB    │
              │  Locking (shared per-account)    │
              └─────────────────────────────────┘
```

Each environment needs the same resources but at different sizes and safety levels. Dev can be destroyed freely; prod must resist accidental deletion.
CIDR blocks must never overlap between environments (otherwise VPC peering would break). Sensitive values (passwords, auth tokens) must never appear in git history
or Terraform state in plaintext. Every data-layer resource (RDS, Redis, MSK, OpenSearch) must reject traffic from anything except ECS tasks — even other resources
within the same VPC must not be able to reach the database.

### Core Variables Table

Variables are grouped by the module that declares them. An input variable is a slot that callers must fill; an output variable is a value that callers can read.

| Variable | Type | Default | Module | Plain-English Meaning |
|----------|------|---------|--------|----------------------|
| `aws_region` | `string` | `us-east-1` | bootstrap, iam, all environments | The AWS geographic region where all resources live |
| `project_name` | `string` | `ecommerce-platform` | bootstrap | Prefix used to name the S3 bucket and DynamoDB table |
| `environment` | `string` | `shared` (bootstrap), per-env default | all modules, all environments | Label like "dev", "staging", or "prod" — goes into every resource name and tag |
| `vpc_cidr` | `string` | `10.0.0.0/16`, `10.1.0.0/16`, `10.2.0.0/16` | vpc, all environments | The IP address block assigned to the VPC; 65,536 addresses |
| `public_subnets_cidr` | `list(string)` | 3x /24 blocks per env | vpc, all environments | Three subnets that get Internet access — one per Availability Zone |
| `private_subnets_cidr` | `list(string)` | 3x /24 blocks per env | vpc, all environments | Three subnets that have no direct Internet access — one per AZ |
| `domain_name` | `string` | dev/staging/prod domain strings | alb, all environments | The DNS domain that the ACM certificate should cover |
| `redis_auth_token` | `string` (sensitive) | none — must be set via `TF_VAR_` | elasticache, all environments | Password that any client must provide before Redis accepts commands |
| `alarm_email_endpoints` | `list(string)` | `[]` | observability, all environments | Email addresses that receive CloudWatch alarm notifications via SNS |
| `flow_logs_role_arn` | `string` | none | vpc | IAM role that lets VPC Flow Logs write records to CloudWatch Logs |
| `flow_logs_retention_days` | `number` | `30` | vpc | How many days VPC Flow Log records stay in CloudWatch before automatic deletion |
| `ecs_security_group_id` | `string` | none | rds, elasticache, msk, opensearch | The shared ECS security group ID — data-layer SGs only accept traffic from this group |
| `identifier` | `string` | none | rds, elasticache, msk, opensearch | A short name like "orders" or "session" that distinguishes one instance from another within the same environment |
| `db_name` | `string` | none | rds | The name of the initial PostgreSQL database created inside the Aurora cluster |
| `db_username` | `string` | none | rds | The master PostgreSQL username for the Aurora cluster |
| `skip_final_snapshot` | `bool` | `true` | rds | If true, Terraform destroys the database without saving a backup first |
| `deletion_protection` | `bool` | `false` | rds | If true, AWS refuses any attempt to delete the database cluster |
| `backup_retention_period` | `number` | `7` | rds | How many days AWS keeps automated database backups |
| `min_capacity` | `number` | `0.5` | rds | Lowest number of Aurora Capacity Units the database can scale down to; 0.5 means near-zero when idle |
| `max_capacity` | `number` | `4.0` | rds | Highest number of ACUs the database can scale up to under load |
| `node_type` | `string` | `cache.t4g.micro` | elasticache | The AWS instance type for each Redis node |
| `num_node_groups` | `number` | `2` | elasticache | How many shards the Redis cluster has; data is distributed across shards |
| `replicas_per_node_group` | `number` | `1` | elasticache | How many read-only copies each shard has for failover |
| `number_of_broker_nodes` | `number` | `3` | msk | How many Kafka brokers run in the MSK cluster |
| `instance_type` | `string` | `kafka.t3.small` | msk | The AWS instance type for each Kafka broker |
| `ebs_volume_size` | `number` | `100` | msk | Storage (in GiB) attached to each Kafka broker |
| `log_retention_days` | `number` | `14` | msk, microservice_base | How long CloudWatch Logs keeps records before deleting them |
| `opensearch_access_role_arn` | `string` | none | opensearch | IAM role ARN that acts as the OpenSearch master user |
| `instance_count` | `number` | `3` | opensearch | How many data nodes in the OpenSearch cluster |
| `service_name` | `string` | none | microservice_base | The short name of the microservice, like "payment-service" |
| `container_image` | `string` | none | microservice_base | Full ECR image URI including tag |
| `container_port` | `number` | none | microservice_base | The TCP port the container application listens on |
| `health_check_path` | `string` | `/health` | microservice_base | The HTTP path the ALB pings to check if a task is healthy |
| `path_pattern` | `string` | `/*` | microservice_base | The URL path that routes to this service, like `/api/orders/*` |
| `listener_priority` | `number` | none | microservice_base | ALB evaluates listener rules in ascending priority order; must be unique |
| `desired_count` | `number` | `2` | microservice_base | How many Fargate tasks should be running all the time |
| `min_tasks` | `number` | `2` | microservice_base | Floor for auto-scaling: count never drops below this |
| `max_tasks` | `number` | `10` | microservice_base | Ceiling for auto-scaling: count never exceeds this |
| `fargate_cpu` | `number` | `256` | microservice_base | CPU units for each task; 1024 = 1 full vCPU |
| `fargate_memory` | `number` | `512` | microservice_base | Memory in MiB for each task |
| `cpu_target_utilization` | `number` | `70` | microservice_base | Auto-scaling target: keep average CPU at this percentage |
| `memory_target_utilization` | `number` | `75` | microservice_base | Auto-scaling target: keep average memory at this percentage |
| `execution_role_arn` | `string` | none | microservice_base | IAM role that lets ECS pull images and read Secrets Manager |
| `task_role_arn` | `string` | none | microservice_base | IAM role that the running container itself assumes |
| `environment_vars` | `list(object({name, value}))` | `[]` | microservice_base | Non-sensitive config values injected as environment variables |
| `secret_vars` | `list(object({name, valueFrom}))` | `[]` | microservice_base | Secrets Manager ARNs injected as environment variables; values never appear in task definition |
| `sns_alarm_arn` | `string` | `""` | microservice_base | The SNS topic ARN where CloudWatch alarms publish; empty string disables alarm actions |
| `alb_arn_suffix` | `string` | none | observability | The ALB's ARN suffix, used in CloudWatch metric dimensions |
| `alb_5xx_threshold` | `number` | `10` | observability | Fire ALB_5xx alarm if 5xx error count exceeds this per minute |
| `alb_4xx_threshold` | `number` | `100` | observability | Fire ALB_4xx alarm if 4xx error count exceeds this per minute |
| `alb_latency_threshold_seconds` | `number` | `2` | observability | Fire latency alarm if p99 response time exceeds this in seconds |
| `rds_cluster_ids` | `map(string)` | `{}` | observability | Mapping of friendly names to RDS cluster identifiers for CPU alarms |
| `msk_cluster_names` | `map(string)` | `{}` | observability | Mapping of friendly names to MSK cluster names for under-replication alarms |

### Key Concepts Table

| Term | Definition |
|------|------------|
| **Remote State** | Terraform stores the known state of all created resources in an S3 bucket (not on your laptop). This is how multiple people and CI/CD pipelines can all work on the same infrastructure without conflicts. |
| **State Locking** | Before Terraform reads or writes state, it acquires a lock in a DynamoDB table. Only one person or pipeline can hold the lock at a time. This prevents two people from applying conflicting changes simultaneously. |
| **Module** | A reusable folder of `.tf` files that you can instantiate multiple times with different input values. Like a function: you call it with arguments and get outputs back. |
| **Provider** | A plugin that knows how to talk to a specific cloud API. This project uses the `hashicorp/aws` provider version `~> 5.0`. |
| **Backend** | Where Terraform stores and retrieves its state. Configured in the `terraform {}` block of each environment root. |
| **Data Source** | A read-only query to AWS that returns information about existing resources. Used here to discover Availability Zones, the current AWS account ID, and ELB service accounts. |
| **`depends_on`** | An explicit ordering constraint. Terraform normally infers order from references, but `depends_on` forces resource A to exist before resource B even when there is no data flow. |
| **`lifecycle` block** | Rules for how Terraform handles resource replacement. The ACM certificate uses `create_before_destroy = true` so a replacement cert is issued before the old one is revoked. |
| **`sensitive = true`** | Marks a variable so that Terraform never prints its value in plan output or logs. The `redis_auth_token` uses this. |
| **Security Group Source Reference** | Instead of writing a CIDR block like `10.0.0.0/16` in a security group ingress rule, you reference another security group's ID. Only EC2 resources attached to that source SG can communicate. |
| **Aurora Capacity Unit (ACU)** | A combined CPU+memory unit for Aurora Serverless v2. 1 ACU ≈ 2 GiB RAM + corresponding CPU. Scaling is automatic between `min_capacity` and `max_capacity`. |
| **Fargate** | AWS runs your containers without you managing the underlying EC2 instances. You specify CPU and memory per task; AWS provisions the host. |
| **Cluster Mode (Redis)** | Redis data is split across multiple shards. Each shard holds a subset of keys. This allows horizontal scaling beyond the memory capacity of a single node. |
| **SASL/SCRAM** | A username+password authentication mechanism for Kafka clients. MSK stores the credentials in AWS Secrets Manager. |
| **Fine-Grained Access Control (OpenSearch)** | OpenSearch features (read an index, create a dashboard) are controlled by IAM roles, not by username+password. No anonymous access is permitted. |
| **Target Tracking Scaling** | Auto-scaling where you set a target (e.g., 70% CPU) and AWS adds/removes tasks to keep the metric near that target. Cooldowns prevent oscillation. |

---

## 3. DATA STRUCTURES

### Environment Root Configuration

Each environment `main.tf` instantiates modules with these input patterns:

```
╔═══════════════════════════════════════════════════════════════╗
║  module "iam" { source = "../modules/iam"                    ║
║    environment = var.environment                             ║
║    aws_region  = var.aws_region                              ║
║  }                                                           ║
║  Produces: ecs_execution_role_arn, ecs_task_role_arn,        ║
║            opensearch_access_role_arn, flow_logs_role_arn    ║
╚═══════════════════════════════════════════════════════════════╝
╔═══════════════════════════════════════════════════════════════╗
║  module "vpc" { source = "../modules/vpc"                    ║
║    vpc_cidr                 = var.vpc_cidr       # e.g. 10.0.0.0/16   ║
║    environment              = var.environment     # e.g. "dev"         ║
║    public_subnets_cidr      = var.public_subnets_cidr                  ║
║    private_subnets_cidr     = var.private_subnets_cidr                 ║
║    flow_logs_role_arn       = module.iam.flow_logs_role_arn            ║
║    flow_logs_retention_days = 30                                       ║
║  }                                                           ║
║  Produces: vpc_id, public_subnet_ids, private_subnet_ids     ║
╚═══════════════════════════════════════════════════════════════╝
╔═══════════════════════════════════════════════════════════════╗
║  module "alb" { source = "../modules/alb"                    ║
║    environment    = var.environment                           ║
║    vpc_id         = module.vpc.vpc_id                         ║
║    public_subnets = module.vpc.public_subnet_ids              ║
║    domain_name    = var.domain_name  # e.g. "dev.example.com"║
║  }                                                           ║
║  Produces: alb_arn_suffix, https_listener_arn,               ║
║            alb_security_group_id, alb_dns_name                ║
╚═══════════════════════════════════════════════════════════════╝
╔═══════════════════════════════════════════════════════════════╗
║  module "ecs_cluster" { source = "../modules/ecs_cluster"    ║
║    environment = var.environment                              ║
║    vpc_id      = module.vpc.vpc_id                            ║
║  }                                                           ║
║  Produces: cluster_id, cluster_name, cluster_security_group_id║
╚═══════════════════════════════════════════════════════════════╝
╔═══════════════════════════════════════════════════════════════╗
║  module "observability" { source = "../modules/observability"║
║    environment           = var.environment                    ║
║    alb_arn_suffix        = module.alb.alb_arn_suffix          ║
║    alarm_email_endpoints = var.alarm_email_endpoints          ║
║    alb_5xx_threshold     = 5 (prod) or default 10             ║
║    rds_cluster_ids       = { orders = module.rds_orders... }  ║
║  }                                                           ║
║  Produces: sns_topic_arn                                     ║
╚═══════════════════════════════════════════════════════════════╝
╔═══════════════════════════════════════════════════════════════╗
║  module "rds_orders" { source = "../modules/rds"             ║
║    environment             = var.environment                  ║
║    identifier              = "orders"                         ║
║    vpc_id                  = module.vpc.vpc_id                ║
║    private_subnets         = module.vpc.private_subnet_ids    ║
║    db_name                 = "orders_db"                      ║
║    db_username             = "orders_admin"                   ║
║    ecs_security_group_id   = module.ecs_cluster.cluster_security_group_id ║
║    skip_final_snapshot     = true (dev) / false (prod)        ║
║    deletion_protection     = false (dev) / true (prod)        ║
║    backup_retention_period = 3 (dev) / 30 (prod)              ║
║    min_capacity            = 0.5 (dev) / 1.0 (prod)           ║
║    max_capacity            = 2.0 (dev) / 8.0 (prod)           ║
║  }                                                           ║
║  Produces: cluster_endpoint, master_user_secret_arn           ║
╚═══════════════════════════════════════════════════════════════╝
```

### Dependency Graph

Arrows show which module consumes which outputs (`A → B` means "B reads A's outputs"):

```
  bootstrap (one-time, no dependencies)
      │
      ▼
    iam
      │
      ├── flow_logs_role_arn ──────► vpc
      │                                │
      ├── opensearch_access_role_arn ──┤────► opensearch
      │                                │
      ├── ecs_execution_role_arn ──────┤──────────────► microservice_base
      ├── ecs_task_role_arn ───────────┤──────────────► microservice_base
      │                                │
      │                           vpc_id ──────────► alb
      │                           vpc_id ──────────► ecs_cluster
      │                           vpc_id ──────────► rds, redis, msk, opensearch, microservice_base
      │                           private_subnets ─► rds, redis, msk, opensearch, microservice_base
      │                           public_subnets ──► alb
      │                                │
      │                           alb_arn_suffix ──► observability
      │                           https_listener_arn ────────────► microservice_base
      │                           alb_security_group_id ──────────► microservice_base
      │                                │
      │                           cluster_id ────────────────────► microservice_base
      │                           cluster_name ──────────────────► microservice_base
      │                           cluster_security_group_id ─────► rds, redis, msk, opensearch
      │                                │
      └────────────────────────────────┤
                                       │
                                  sns_topic_arn ─────────────────► microservice_base
```

### Module Output Signatures

These are the values that downstream modules and environment outputs read:

```
vpc → { vpc_id, vpc_cidr_block, public_subnet_ids, private_subnet_ids, nat_gateway_ids }

alb → { alb_arn, alb_arn_suffix, alb_dns_name, alb_zone_id,
        https_listener_arn, http_listener_arn, alb_security_group_id,
        acm_certificate_arn, acm_certificate_domain_validation_options }

ecs_cluster → { cluster_id, cluster_name, cluster_security_group_id }

iam → { ecs_execution_role_arn, ecs_task_role_arn,
        opensearch_access_role_arn, flow_logs_role_arn }

rds → { cluster_endpoint, cluster_reader_endpoint,
        security_group_id, master_user_secret_arn }

elasticache → { cluster_endpoint, security_group_id }

msk → { bootstrap_brokers, bootstrap_brokers_tls,
        bootstrap_brokers_sasl_scram, zookeeper_connect_string }

opensearch → { domain_endpoint, dashboard_endpoint, security_group_id }

observability → { sns_topic_arn, dashboard_name }

microservice_base → { service_name, target_group_arn,
                      security_group_id, task_definition_arn }

bootstrap → { state_bucket_name, dynamodb_table_name, aws_account_id }
```

---

## 4. ALGORITHM DIAGRAMS

### 4.1 Terraform Plan/Apply Flow

Every `terraform plan` or `terraform apply` follows this sequence:

```
terraform plan
    │
    ├─[1] Read remote state from S3
    │     Acquires DynamoDB lock on "ecommerce-platform-terraform-locks"
    │     Reads: ecommerce-platform/dev/terraform.tfstate
    │
    ├─[2] Parse all .tf files in current directory + referenced modules
    │     Resolves: source = "../../modules/vpc" → reads all .tf in that dir
    │
    ├─[3] Build dependency graph
    │     module.iam (no deps) → module.vpc (needs flow_logs_role_arn)
    │     → module.alb (needs vpc_id, public_subnets)
    │     → module.ecs_cluster (needs vpc_id)
    │     → module.rds_orders (needs vpc_id, private_subnets, ecs_security_group_id)
    │
    ├─[4] For each node in graph:
    │     Compare desired state (from .tf files) with actual state (from remote state)
    │     Output: CREATE, UPDATE, DELETE, or NO-OP for each resource
    │
    ├─[5] Output plan to stdout
    │     Plan: 42 to add, 1 to change, 0 to destroy.
    │
    └─[6] If -out=tfplan was used:
          Save binary plan to tfplan file for apply to consume exactly

terraform apply tfplan
    │
    ├─[1] Read saved tfplan (guarantees same plan as reviewed)
    ├─[2] Acquire DynamoDB lock
    ├─[3] Execute changes in dependency order:
    │     aws_iam_role.ecs_execution → aws_vpc.main → aws_subnet.public[0] →
    │     aws_nat_gateway.main[0] → aws_lb.main → aws_lb_listener.https →
    │     aws_ecs_service.main → ...
    ├─[4] Write new state to S3: ecommerce-platform/dev/terraform.tfstate
    └─[5] Release DynamoDB lock
```

### 4.2 Security Group Chain

Security groups in this project form a chain. Each link only trusts the previous link:

```
   INTERNET (0.0.0.0/0)
        │
        │  :80, :443 (wide open)
        ▼
   ┌─────────────┐
   │  alb-sg      │  albsg
   │              │  (source)
   └──────┬───────┘
          │
          │  :8080 (from alb-sg only)
          ▼
   ┌──────────────┐
   │  ecs-task-sg  │  ─── assigned to each microservice's Fargate ENI
   │              │
   └──────┬───────┘
          │
          │  task ENI belongs to ecs-shared-sg for data-layer access
          │  :5432 (RDS), :6379 (Redis), :9092-9094 (MSK), :443 (OpenSearch)
          ▼
   ┌─────────────────┐
   │  ecs-shared-sg   │  ecs_cluster
   │  (no ingress)    │  (source reference)
   └────────┬─────────┘
            │
            │  accepted as source by ingress rules:
            ▼
   ┌──────────────────────────────────────────────────────┐
   │  rds-sg          redis-sg         msk-sg         os-sg  │
   │  :5432           :6379            :9092-9094     :443   │
   │  from ecs-shared  from ecs-shared  from ecs-shared from ecs-shared │
   └──────────────────────────────────────────────────────┘
```

**Key rule** (source: `terraform/modules/rds/main.tf:20-27`, repeated in all data-layer modules):
The ingress rule uses `referenced_security_group_id`, not `cidr_ipv4`. This means only ENIs in `ecs-shared-sg` can reach the database port — no IP address, even one inside the VPC, can bypass this.

### 4.3 Network Routing Per AZ

Each of the 3 Availability Zones has its own public and private subnet. Private subnets route outbound through their zone-local NAT Gateway:

```
                        ┌─────────────────────────────────────┐
                        │            VPC 10.0.0.0/16           │
                        │                                      │
  ┌─────────────────────┤  AZ-1 (us-east-1a)                  │
  │                     │  ┌──────────────────┐               │
  │   Internet ←─IGW───────│ public 10.0.1.0/24│               │
  │                        │  └────────┬─────────┘               │
  │                        │           │ NAT-GW-1               │
  │                        │           ▼                        │
  │                        │  ┌──────────────────┐               │
  │                        │  │ private 10.0.4.0/24│  ← ECS tasks │
  │                        │  └──────────────────┘               │
  │                     └─────────────────────────────────────┤
  │                     ┌─────────────────────────────────────┐
  │                     │  AZ-2 (us-east-1b)                  │
  │                     │  ┌──────────────────┐               │
  │   Internet ←─IGW──────│ public 10.0.2.0/24│               │
  │                        │  └────────┬─────────┘               │
  │                        │           │ NAT-GW-2               │
  │                        │           ▼                        │
  │                        │  ┌──────────────────┐               │
  │                        │  │ private 10.0.5.0/24│             │
  │                        │  └──────────────────┘               │
  │                     └─────────────────────────────────────┤
  │                     AZ-3: same pattern with 10.0.3.0/24, 10.0.6.0/24   │
  └─────────────────────────────────────────────────────────────┘
```

**Why one private route table per AZ** (source: `terraform/modules/vpc/main.tf:111-123`):
`aws_route_table.private[count.index]` routes `0.0.0.0/0` → `aws_nat_gateway.main[count.index].id`.

- Input: An ECS task in AZ-2 (`10.0.5.0/24`) sends a packet to the Internet (`8.8.8.8`).
- Route lookup: The task's subnet associates with `private-rt-2`, which says "send 0.0.0.0/0 to NAT-GW-2."
- Forward: NAT-GW-2 (in public `10.0.2.0/24`) translates the source IP and sends to IGW.
- Failure scenario: If NAT-GW-1 (in AZ-1) fails because us-east-1a is degraded, private-rt-1 loses its default route, but private-rt-2 and private-rt-3 still have working routes through NAT-GW-2 and NAT-GW-3.

**What breaks if one shared route table were used for all AZs** (common anti-pattern):
A single NAT GW in AZ-1 routing egress for all three AZs. If AZ-1 fails, all three private subnets lose Internet connectivity, even though the tasks in AZ-2 and AZ-3 are still running.

### 4.4 Auto-Scaling Formula

Each microservice has two target-tracking policies on the same scaling target:

```
CPU Target-Tracking:
  Metric: ECSServiceAverageCPUUtilization
  Target: 70%
  Scale-out cooldown: 60s     ← wait 60s before adding another task
  Scale-in cooldown:  300s    ← wait 5 min before removing a task

Memory Target-Tracking:
  Metric: ECSServiceAverageMemoryUtilization
  Target: 75%
  Scale-out cooldown: 60s
  Scale-in cooldown:  300s
```

Both policies control the same `DesiredCount`. Whichever metric breaches its target first triggers scaling.

**Concrete example**: A `payment-service` has 2 tasks running. CPU average spikes to 82% (above the 70% target).

```
Input: current_cpu = 82%, target_cpu = 70%, current_count = 2
  → DesiredCount = ceil(2 × 82/70) = ceil(2.34) = 3

Terraform resources involved (source: microservice_base/main.tf:155-177):
  aws_appautoscaling_target.ecs       (min=2, max=10)
  aws_appautoscaling_policy.cpu       (target_value=70, scale_out_cooldown=60)
  aws_appautoscaling_policy.memory    (target_value=75, scale_out_cooldown=60)
```

The `scale_in_cooldown` of 300 seconds (5 minutes) is deliberately longer than `scale_out_cooldown` (60 seconds). This asymmetry means the system adds capacity quickly under load but removes it slowly, preventing oscillations where a brief traffic dip removes tasks that are needed moments later.

**CloudWatch alarm guard** (source: `microservice_base/main.tf:201-218`):
Separate from auto-scaling, an alarm fires if CPU exceeds 85% for 2 consecutive 60-second evaluations. This alarm does not control scaling — it alerts humans that auto-scaling may be insufficient or bottlenecked. If `sns_alarm_arn` is empty string `""`, alarm actions are set to `[]` — the alarm is created but sends no notification.

### 4.5 Aurora Serverless v2 Scaling

The RDS module uses `serverlessv2_scaling_configuration` (source: `rds/main.tf:63-66`):

```
Input: min_capacity = 0.5, max_capacity = 2.0 (dev)
       min_capacity = 1.0, max_capacity = 8.0 (prod)

Scaling mechanism:
  Aurora monitors CPU + connection count internally.
  Scales in 0.5 ACU increments between min and max.
  Scale-up takes 5-15 seconds. Scale-down is gradual.

0.5 ACU ≈ 1 GiB RAM (dev can idle at near-zero cost)
1.0 ACU ≈ 2 GiB RAM (prod floor ensures responsiveness during idle)
8.0 ACU ≈ 16 GiB RAM (prod ceiling under peak load)
```

---

## 5. EVENT LIFECYCLE

### Full deployment trace: zero AWS resources → running payment service

**Step 0 — Prerequisites**
- AWS account ID: `111122223333`
- Domain `dev.example.com` registered in Route 53
- Repository cloned, `terraform` binary ≥ 1.5.0 installed

**Step 1 — Bootstrap (run once per account)**
```bash
cd terraform/bootstrap
terraform init
terraform apply
```

Creates:
| Resource | Name | Purpose |
|----------|------|---------|
| `aws_s3_bucket.terraform_state` | `ecommerce-platform-terraform-state-111122223333` | Stores all environment state files |
| `aws_s3_bucket_versioning` | (same bucket) | Every state write creates an immutable version |
| `aws_s3_bucket_server_side_encryption` | (same bucket) | Encrypts state at rest with AES-256 |
| `aws_s3_bucket_public_access_block` | (same bucket) | All 4 blocks enabled — no public access possible |
| `aws_s3_bucket_lifecycle` | (same bucket) | Deletes non-current state versions after 90 days |
| `aws_dynamodb_table.terraform_locks` | `ecommerce-platform-terraform-locks` | `LockID` is hash key, `PAY_PER_REQUEST` billing |
| (DynamoDB table) PITR | enabled | Point-in-time recovery |

Outputs: `state_bucket_name`, `dynamodb_table_name`, `aws_account_id`

**Step 2 — Set sensitive variable**
```bash
export TF_VAR_redis_auth_token="L3tm3ChO0s3S0m3th1ngR4nd0m!"  # minimum 16 chars
```

This variable is marked `sensitive = true` in `terraform/environments/dev/variables.tf:39-42`.
Terraform never prints its value. The token goes directly to the Redis module (`elasticache/variables.tf:26-29`), which passes it to `aws_elasticache_replication_group.main.auth_token`.

**Step 3 — Initialize environment**
```bash
cd terraform/environments/dev
terraform init
```

Backend config (source: `environments/dev/main.tf:3-8`):
- `bucket = "ecommerce-platform-terraform-state"`
- `key = "ecommerce-platform/dev/terraform.tfstate"`
- `dynamodb_table = "ecommerce-platform-terraform-locks"`
- `encrypt = true`

Plugin download: `hashicorp/aws` version matching `~> 5.0`.

**Step 4 — Plan (generates the diff)**
```bash
terraform plan -out=tfplan
```

Terraform resolves the dependency graph and determines resource creation order:

```
Phase 1 — IAM (no dependencies):
  aws_iam_role.ecs_execution        → dev-ecs-execution-role
  aws_iam_role_policy_attachment.ecs_execution_policy
  aws_iam_role_policy.ecs_execution_secrets  (scoped to arn:aws:secretsmanager:us-east-1:111122223333:secret:dev/*)
  aws_iam_role.ecs_task             → dev-ecs-task-role
  aws_iam_role.opensearch_access    → dev-opensearch-access-role
  aws_iam_role_policy.opensearch_access
  aws_iam_role.flow_logs            → dev-vpc-flow-logs-role
  aws_iam_role_policy.flow_logs

Phase 2 — VPC (depends on iam.flow_logs_role_arn):
  data.aws_availability_zones.available  (query: state = "available")
  aws_vpc.main                       → 10.0.0.0/16, dns_hostnames=true
  aws_internet_gateway.main          → dev-igw
  aws_subnet.public[0..2]            → 10.0.1.0/24 (us-east-1a), 10.0.2.0/24 (us-east-1b), 10.0.3.0/24 (us-east-1c)
  aws_subnet.private[0..2]           → 10.0.4.0/24, 10.0.5.0/24, 10.0.6.0/24
  aws_eip.nat[0..2]                  → 3 Elastic IPs
  aws_nat_gateway.main[0..2]         → 1 per public subnet
  aws_route_table.public             → route 0.0.0.0/0 → IGW
  aws_route_table.private[0..2]      → each routes 0.0.0.0/0 → its AZ-local NAT GW
  aws_route_table_association.public[0..2]
  aws_route_table_association.private[0..2]
  aws_cloudwatch_log_group.flow_logs → /aws/vpc/flow-logs/dev, retention 30 days
  aws_flow_log.main                  → captures ALL traffic to CW

Phase 3 — ALB (depends on vpc.vpc_id, vpc.public_subnet_ids):
  aws_s3_bucket.alb_logs         → dev-alb-access-logs-111122223333
  aws_s3_bucket_policy.alb_logs  → allows ELB service account PutObject
  aws_acm_certificate.main       → dev.example.com + *.dev.example.com, DNS validation
  aws_security_group.alb         → dev-alb-sg: open :80, :443 from 0.0.0.0/0
  aws_lb.main                    → dev-public-alb, internal=false, deletion_protection=false
  aws_lb_listener.http           → port 80, redirect to HTTPS 443 with 301
  aws_lb_listener.https          → port 443, TLS 1.3 preferred, default 404 JSON response

Phase 4 — ECS Cluster (depends on vpc.vpc_id):
  aws_ecs_cluster.main                   → dev-ecs-cluster, Container Insights enabled
  aws_ecs_cluster_capacity_providers.main → FARGATE (base=1, weight=100) + FARGATE_SPOT
  aws_security_group.ecs_shared          → dev-ecs-shared-sg (no ingress, all egress)

Phase 5 — Observability (depends on alb.alb_arn_suffix):
  aws_sns_topic.alarms                   → dev-infrastructure-alarms
  aws_sns_topic_subscription.email[0]    → alarm_email_endpoints[0]
  aws_cloudwatch_metric_alarm.alb_5xx    → threshold 10 (dev)
  aws_cloudwatch_metric_alarm.alb_4xx    → threshold 100
  aws_cloudwatch_metric_alarm.alb_target_response_time → p99 > 2s
  aws_cloudwatch_dashboard.main          → dev-infrastructure-overview

Phase 6 — Data Layer (all depend on vpc + ecs_cluster):
  Database clusters per domain (orders, users, products):
    aws_db_subnet_group.main              → dev-orders-subnet-group
    aws_security_group.rds                → dev-orders-rds-sg
    aws_vpc_security_group_ingress_rule   → :5432 from ecs-shared-sg
    aws_rds_cluster.main                  → Aurora PG 15.3, min=0.5, max=2.0 ACU
    aws_rds_cluster_instance.main         → db.serverless

  Redis:
    aws_elasticache_subnet_group.main
    aws_security_group.redis
    aws_vpc_security_group_ingress_rule   → :6379 from ecs-shared-sg
    aws_cloudwatch_log_group.redis_slow_logs
    aws_elasticache_replication_group.main → 2 shards × 1 replica, AUTH token

  MSK:
    aws_security_group.msk
    aws_vpc_security_group_ingress_rule   → :9092-9094 from ecs-shared-sg
    aws_cloudwatch_log_group.msk_logs
    aws_msk_cluster.main                  → 3 brokers, kafka.t3.small, TLS + SASL/SCRAM

  OpenSearch:
    aws_security_group.opensearch
    aws_vpc_security_group_ingress_rule   → :443 from ecs-shared-sg
    aws_opensearch_domain.main            → OpenSearch 2.11, 3 nodes t3.small, fine-grained AC

Phase 7 — Microservice (opening a PR to add this block):
  aws_cloudwatch_log_group.main           → /ecs/dev/order-service
  aws_security_group.ecs_tasks            → dev-order-service-sg, ingress :8080 from alb-sg
  aws_ecs_task_definition.main            → dev-order-service, 512 CPU, 1024 mem
  aws_lb_target_group.main                → dev-order-service-tg, health :8080/health
  aws_lb_listener_rule.main               → priority 110, path /api/orders/*
  aws_ecs_service.main                    → Fargate, private subnets, no public IP
  aws_appautoscaling_target.ecs           → min=2, max=10
  aws_appautoscaling_policy.cpu           → target 70%
  aws_appautoscaling_policy.memory        → target 75%
  aws_cloudwatch_metric_alarm.cpu_high    → >85% for 2×60s
  aws_cloudwatch_metric_alarm.memory_high → >85% for 2×60s
```

**Step 5 — Apply**
```bash
terraform apply tfplan
```

Execution order follows Phase 1→7 above. After apply completes (approximately 15-25 minutes for first run), Terraform writes the new state to S3 and outputs endpoints:

```
alb_dns_name = "dev-public-alb-1234567890.us-east-1.elb.amazonaws.com"
orders_db_endpoint = "dev-orders-cluster.cluster-xyz.us-east-1.rds.amazonaws.com"
redis_endpoint = "clustercfg.dev-session-cluster.abc.use1.cache.amazonaws.com:6379"
opensearch_endpoint = "vpc-dev-search-xyz.us-east-1.es.amazonaws.com"
msk_bootstrap_brokers_tls = "b-1.dev-events-cluster.abc.kafka.us-east-1.amazonaws.com:9094,..."
```

**Step 6 — ACM validation**
User retrieves DNS records:
```bash
terraform output acm_validation_records
```
Creates CNAME records in their DNS provider. ACM validates within 5 minutes. The HTTPS listener becomes active.

**Step 7 — Runtime traffic (payment-service example)**
```
User browser → https://dev.example.com/api/orders/123

  1. DNS resolves dev.example.com → ALB DNS name
  2. TLS handshake at ALB, certificate matches domain (including *.dev.example.com SAN)
  3. ALB evaluates listener rules in priority order
  4. Rule priority 110 matches path /api/orders/*
  5. ALB selects a healthy target in dev-order-service-tg
  6. Forwards request to ECS task ENI in private subnet 10.0.4.15:8080
  7. Container handles /api/orders/123, queries dev-orders-cluster at :5432
     (Connection from ENI 10.0.4.15:5432 → RDS dev-orders-rds-sg → ingress rule accepts
      because the source ENI's security group is dev-ecs-shared-sg)
  8. Container returns JSON response → ALB → user browser
```

---

## 6. FULL-STACK FLOW

Horizontal swimlane showing which component acts at each stage:

```
TIME ────────────────────────────────────────────────────────────────────────────►

USER/CLI     │ terraform init  │ export TF_VAR   │ terraform plan   │ terraform apply
             │                 │ redis_auth_token │ -out=tfplan      │ tfplan
             │                 │                 │                  │
TERRAFORM    │ download        │                 │ read S3 state    │ execute graph:
CORE         │ providers       │                 │ build dep graph  │ IAM→VPC→ALB→ECS
             │                 │                 │ diff current vs  │ →RDS→Redis→MSK
             │                 │                 │ desired          │ →OpenSearch→Svc
             │                 │                 │                  │
AWS API      │                 │                 │                  │ CreateRole
             │                 │                 │                  │ CreateVpc
             │                 │                 │                  │ CreateSubnet
             │                 │                 │                  │ CreateNatGateway
             │                 │                 │                  │ CreateLoadBalancer
             │                 │                 │                  │ CreateCluster
             │                 │                 │                  │ CreateDBCluster
             │                 │                 │                  │ CreateReplicationGroup
             │                 │                 │                  │ CreateMskCluster
             │                 │                 │                  │ CreateOpenSearchDomain
             │                 │                 │                  │ CreateService
             │                 │                 │                  │
S3/DDB       │                 │                 │ read state +     │ write new state
(backend)    │                 │                 │ acquire lock     │ release lock
             │                 │                 │                  │
             ▼                 ▼                 ▼                  ▼

RUNTIME ─────────────────────────────────────────────────────────────────────────►

DNS          │ dev.example.com CNAME → ALB
             │
ALB          │ port 443, TLS 1.3, evaluates listener rules by priority
             │ health checks each target group every 30s
             │ logs one access log file per minute to S3
             │
ECS          │ Fargate tasks in private subnets, 2 per service (min)
             │ container pulls image from ECR using execution role
             │ writes app logs to /ecs/dev/{service-name} CloudWatch group
             │
DATA LAYER   │ Aurora scales between 0.5-2.0 ACU (dev), 1.0-8.0 (prod)
             │ Redis cluster: data sharded across 2-3 node groups
             │ MSK: 3 brokers, TLS-only client communication
             │ OpenSearch: 3 data nodes, HTTPS-only, IAM auth
             │
OBSERVABILITY│ SNS alarms fire on: ALB 5xx, ALB latency, RDS CPU, MSK under-replication
             │ CloudWatch dashboard shows ALB metrics in 3-panel layout
             │ Auto-scaling policies add/remove tasks every 60-300s
```

---

## 7. DESIGN DECISIONS

### 7.1 Multi-AZ NAT Gateways (One per AZ)

**Why**: A single NAT Gateway is an AZ-level single point of failure. If us-east-1a loses power or becomes degraded, every private subnet — even those in us-east-1b and us-east-1c — loses outbound Internet.

**What breaks without it**: All 3 AZs' private subnets lose egress if any one AZ fails. Cross-AZ data transfer costs go up because traffic from AZ-2 and AZ-3 must route through AZ-1's NAT GW.

**Implementation**: `aws_nat_gateway.main` uses `count = length(var.public_subnets_cidr)` (`vpc/main.tf:79-90`), placing one NAT GW in each public subnet. Each private route table (`vpc/main.tf:111-123`) routes `0.0.0.0/0` through its index-matched NAT GW: `nat_gateway_id = aws_nat_gateway.main[count.index].id`.

### 7.2 Security Group Source References (Not CIDR Blocks)

**Why**: CIDR-based ingress rules grant access to any resource with an IP in that range — including a compromised EC2 instance that happens to share the VPC. A CIDR rule saying "10.0.0.0/16 can reach RDS" means every resource in the VPC can.

**What breaks without it**: An attacker who compromises the Jenkins server in the public subnet (not running as ECS) can reach the database directly because its IP is in the allowed CIDR.

**Implementation**: Every data-layer ingress rule uses `referenced_security_group_id = var.ecs_security_group_id` (e.g., `rds/main.tf:20-27`). This references the shared ECS SG `ecs-shared-sg` (`ecs_cluster/main.tf:29-43`). The shared SG has no resources directly attached — it exists purely as an identity reference. Only tasks that ECS creates implicitly inherit this SG via their ENI.

### 7.3 `manage_master_user_password = true` for RDS

**Why**: Before this AWS feature, you had to write database passwords as Terraform variables or in `.tfvars` files. Even with `sensitive = true`, the password appeared in Terraform state — which is stored unencrypted in most setups, visible to anyone with S3 read access.

**What breaks without it**: Database passwords in plaintext in the state file. Anyone who can read the S3 bucket can extract every database password. Rotating passwords requires updating Terraform state.

**Implementation**: `aws_rds_cluster.main` sets `manage_master_user_password = true` (`rds/main.tf:50`). AWS Secrets Manager generates, stores, and rotates the password. Terraform state only contains the secret ARN: `aws_rds_cluster.main.master_user_secret[0].secret_arn` (`rds/outputs.tf:16-19`).

### 7.4 Per-AZ Private Route Tables

**Why**: With a single private route table, all private subnets in all AZs route through the same NAT Gateway. If the NAT GW's AZ fails, all AZs lose egress.

**What breaks without it**: AZ failure cascades to private subnets in all AZs. You lose the multi-AZ resilience that ECS services deployed across AZs are supposed to provide.

**Implementation**: `aws_route_table.private` uses `count = length(var.private_subnets_cidr)` (`vpc/main.tf:111-123`). Route table `private-rt-0` routes through `nat-gw-0` in AZ-1; `private-rt-1` → `nat-gw-1` in AZ-2; `private-rt-2` → `nat-gw-2` in AZ-3. Each private subnet associates with its AZ-local route table (`vpc/main.tf:136-141`).

### 7.5 Fargate Over EC2 Launch Type

**Why**: Fargate removes server management. No patching AMIs, no OS-level security updates, no bin-packing calculations, no EC2 autoscaling for the cluster itself.

**What breaks without it**: You need separate infrastructure to manage EC2 instances (ASG, launch templates, AMI pipelines, node draining). Rolling OS patches without downtime becomes an operational burden that distracts from application delivery.

**Implementation**: `aws_ecs_service.main` has `launch_type = "FARGATE"` and `network_configuration.assign_public_ip = false` (`microservice_base/main.tf:125-136`). CPU and memory are specified per task definition, not per instance.

### 7.6 Aurora Serverless v2 Over Provisioned

**Why**: Provisioned instances have a fixed capacity that you must plan for peak load. During idle periods (nights, weekends), you pay for unused capacity. Serverless v2 scales down to near-zero (0.5 ACU ≈ 1 GiB RAM), reducing cost in dev and staging.

**What breaks without it**: Either over-provision and pay for idle capacity, or under-provision and risk brownouts during traffic spikes.

**Implementation**: `serverlessv2_scaling_configuration` with `min_capacity` and `max_capacity` (`rds/main.tf:63-66`). Dev: 0.5–2.0 ACU. Prod: 1.0–8.0 ACU. Scaling happens in 0.5 ACU increments with no downtime.

### 7.7 DNS ACM Validation Over Email Validation

**Why**: DNS validation can be automated entirely within Terraform. Email validation sends a confirmation to the domain's registrant/admin/technical contacts, which is manual and fragile (the email goes to whoever registered the domain, often a departed employee).

**What breaks without it**: Certificate renewal requires human intervention every 12 months. Automated CI/CD can't manage the certificate lifecycle.

**Implementation**: `aws_acm_certificate.main` uses `validation_method = "DNS"` and has `lifecycle.create_before_destroy = true` (`alb/main.tf:125-135`). The `domain_validation_options` are output so DNS records can be created once and then forgotten.

### 7.8 Cluster-Mode Redis Over Single-Node

**Why**: Single-node Redis has a single failure domain and limited memory. Cluster mode distributes keys across shards, enabling horizontal scaling and automatic failover.

**What breaks without it**: Redis becomes unavailable for minutes during a failover. Memory is capped at the largest single node type. Session data grows with user count and cannot be scaled beyond one instance.

**Implementation**: `parameter_group_name = "default.redis7.cluster.on"`, `automatic_failover_enabled = true`, `multi_az_enabled = true` (`elasticache/main.tf:57-59`). `num_node_groups` determines shard count (2 in dev/staging, 3 in prod).

### 7.9 Remote State (S3 + DynamoDB) Over Local State

**Why**: Local state files on a developer's laptop are lost when the laptop dies, can't be shared with teammates, and drift from reality because only one person's state reflects the latest apply.

**What breaks without it**: Two engineers running `terraform apply` from different laptops with different state files will create conflicting resources or overwrite each other's changes. CI/CD pipelines have no access to state.

**Implementation**: Backend `s3` with `encrypt = true` and `dynamodb_table` for locking. State key per environment: `ecommerce-platform/{env}/terraform.tfstate` (`environments/{env}/main.tf:3-8`). Bootstrap creates the bucket with versioning, SSE, public access block, and lifecycle rules (`bootstrap/main.tf:1-165`).

---

## 8. EDGE CASES TABLE

| Scenario | How Handled | Source File:Line |
|----------|-------------|------------------|
| **User runs `terraform destroy` in prod** | `enable_deletion_protection = true` on ALB when `var.environment == "prod"`; `deletion_protection = true` on all RDS clusters; DynamoDB uses `force_destroy = false` on S3 bucket. AWS API rejects the destroy. | `alb/main.tf:149`, `rds/main.tf:58`, `bootstrap/main.tf:14` |
| **Dev database gets accidentally deleted** | `skip_final_snapshot = true` (dev) means no backup is taken. This is intentional: dev data is non-critical. Staging also skips. Prod uses `skip_final_snapshot = false` and `final_snapshot_identifier` is computed from environment + identifier. | `rds/main.tf:55-56` |
| **NAT Gateway in AZ-1 fails** | Each AZ has its own NAT GW + private route table. AZ-2 and AZ-3 private subnets continue routing through their local NAT GWs. Only AZ-1 private subnets lose egress. | `vpc/main.tf:79-90`, `vpc/main.tf:111-123` |
| **Two engineers run `terraform apply` simultaneously** | DynamoDB lock prevents concurrent applies. The second engineer's `terraform apply` blocks with "Error acquiring the state lock" until the first releases it. | `bootstrap/main.tf:97-117` (DynamoDB), `environments/*/main.tf:3-8` (backend config) |
| **ACM certificate has not been validated yet** | The HTTPS listener is created but the certificate status is `PENDING_VALIDATION`. ALB returns a certificate error to browsers until DNS records are created. Terraform output provides the exact CNAME records needed. | `alb/main.tf:125-135` (cert), `alb/outputs.tf:41-43` (validation output) |
| **Redis AUTH token not set in env** | `var.redis_auth_token` has no default value and `sensitive = true`. Terraform plan/apply fails with "No value for required variable" before touching any AWS resource. | `environments/dev/variables.tf:37-42` |
| **ECS task fails to pull container image** | `ecs_execution_role_arn` (IAM module) grants `AmazonECSTaskExecutionRolePolicy` which includes `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, and `logs:CreateLogStream`, `logs:PutLogEvents`. Also grants `secretsmanager:GetSecretValue` scoped to `{environment}/*`. | `iam/main.tf:9-47` |
| **Container health check returns non-200** | ALB marks the target as unhealthy. Target group has `healthy_threshold = 3` (3 consecutive successes before marking healthy), `unhealthy_threshold = 2` (2 consecutive failures to mark unhealthy), `interval = 30` seconds. After 2 failures (60s), traffic stops routing to that task. ECS kills the old task and launches a replacement. | `microservice_base/main.tf:89-97` |
| **CPU/Memory alarms fire but email list is empty** | `alarm_email_endpoints` defaults to `[]`. `aws_sns_topic_subscription.email` uses `count = length(var.alarm_email_endpoints)` — if empty, zero subscriptions are created. Alarms still have `alarm_actions = [aws_sns_topic.alarms.arn]` — they fire to SNS but SNS has no subscribers, so nobody receives the alert. This is valid for pure dashboard-based monitoring. | `observability/main.tf:11-17`, `microservice_base/main.tf:211-212` |
| **ECS service with empty `sns_alarm_arn`** | `var.sns_alarm_arn` defaults to `""`. Alarm actions use ternary: `var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []`. When empty, the alarm is created but sends no notifications — useful for services still in development. | `microservice_base/main.tf:211-212` |
| **RDS password rotation by Secrets Manager** | `manage_master_user_password = true` enables automatic rotation. The secret ARN is output as `master_user_secret_arn`. Application must read the password from Secrets Manager at startup (not from Terraform output), because the value changes during rotation. | `rds/main.tf:50`, `rds/outputs.tf:16-19` |
| **MSK broker disk fills up** | `ebs_volume_size` (100 GiB dev, 500 GiB prod) with Kafka topic retention policies. No auto-scaling for MSK disks — operator must increase `ebs_volume_size` and run `terraform apply`. CloudWatch broker metrics should be monitored before the disk fills. | `msk/main.tf:54-59` |
| **OpenSearch domain accessed from outside VPC** | `vpc_options.subnet_ids` restricts to private subnets. `advanced_security_options.anonymous_auth_enabled = false`. `access_policies` restricts `es:*` to only `var.opensearch_access_role_arn`. Domain endpoint resolves to a VPC-private IP. No public access possible. | `opensearch/main.tf:60-63`, `opensearch/main.tf:79-87`, `opensearch/main.tf:90-98` |
| **Non-overlapping CIDRs across environments** | Each environment uses a unique `/16`: dev=10.0.0.0/16, staging=10.1.0.0/16, prod=10.2.0.0/16. Subnet CIDRs shift accordingly. This prevents any accidental overlap that would block VPC peering or Transit Gateway connections. | `environments/dev/variables.tf:13-27`, `environments/staging/variables.tf:13-27`, `environments/prod/variables.tf:13-27` |
| **ALB listener rule priority conflict** | Each `listener_priority` must be unique per listener. If two services use the same priority, `terraform apply` fails with an AWS API error. The README documents this: "pick a unique priority number." No automated enforcement — relies on code review. | README line ~200-210 (new service example) |
| **OpenSearch fine-grained AC master user deletion** | The IAM role ARN is the sole master user. If the role is deleted outside Terraform, the domain becomes administratively locked. The role uses `ecs-tasks.amazonaws.com` as trust principal, so only ECS tasks can assume it — but no ECS task would normally assume this role, it's purely for OpenSearch admin operations via signed requests. | `iam/main.tf:76-89` (role), `opensearch/main.tf:84-86` (master_user_options) |

---

## 9. INTEGRATION POINT

### Adding a New Microservice

This is the actual call site an engineer would add to `terraform/environments/{env}/main.tf`. It instantiates the `microservice_base` module with all required wiring:

```hcl
# ---------------------------------------------------------------------------
# Microservices — add new services here
# ---------------------------------------------------------------------------

# module "order_service" {
#   source = "../../modules/microservice_base"
#
#   # === IDENTITY ===
#   environment  = var.environment       # "dev", "staging", or "prod" — propagates to all resource names
#   service_name = "order-service"       # must be unique within this environment
#   aws_region   = var.aws_region        # "us-east-1" — used by CloudWatch log driver
#
#   # === NETWORKING ===
#   vpc_id          = module.vpc.vpc_id                    # the VPC created by the vpc module
#   private_subnets = module.vpc.private_subnet_ids        # ECS tasks get IPs from these subnets
#
#   # === ECS CLUSTER ===
#   cluster_id   = module.ecs_cluster.cluster_id           # which cluster to place tasks on
#   cluster_name = module.ecs_cluster.cluster_name          # "dev-ecs-cluster" — for CloudWatch dimensions
#
#   # === ALB ROUTING ===
#   alb_security_group_id = module.alb.alb_security_group_id # tasks only accept traffic from this SG
#   listener_arn          = module.alb.https_listener_arn    # attach rule to the HTTPS:443 listener
#   listener_priority     = 100                             # must be unique — lower = evaluated first
#   path_pattern          = "/api/orders/*"                  # requests matching this path go to this service
#
#   # === CONTAINER ===
#   container_image   = "111122223333.dkr.ecr.us-east-1.amazonaws.com/order-service:latest"
#   container_port    = 8080                                 # the PORT inside the container
#   health_check_path = "/health"                            # ALB pings this to determine if task is alive
#
#   # === COMPUTE ===
#   fargate_cpu    = 512                                     # 0.5 vCPU
#   fargate_memory = 1024                                    # 1 GiB RAM
#
#   # === IAM ===
#   execution_role_arn = module.iam.ecs_execution_role_arn   # pull ECR image + read secrets
#   task_role_arn      = module.iam.ecs_task_role_arn        # container's AWS permissions
#
#   # === SCALING ===
#   desired_count  = 2           # start with 2 tasks
#   min_tasks      = 2           # never go below 2 (HA)
#   max_tasks      = 10          # never exceed 10 (cost cap)
#
#   # === ALERTING ===
#   sns_alarm_arn = module.observability.sns_topic_arn  # where to send CPU/memory alarms
#
#   # === ENVIRONMENT VARIABLES (non-sensitive) ===
#   environment_vars = [
#     { name = "ENVIRONMENT", value = var.environment },
#     { name = "LOG_LEVEL",   value = "info" },
#     { name = "DB_HOST",     value = module.rds_orders.cluster_endpoint },
#     { name = "DB_NAME",     value = "orders_db" },
#     { name = "REDIS_HOST",  value = module.redis.cluster_endpoint },
#     { name = "MSK_BOOTSTRAP", value = module.msk.bootstrap_brokers_tls },
#   ]
#
#   # === SECRETS (from AWS Secrets Manager) ===
#   secret_vars = [
#     { name = "DB_PASSWORD",  valueFrom = module.rds_orders.master_user_secret_arn },
#     { name = "REDIS_AUTH",   valueFrom = "arn:aws:secretsmanager:us-east-1:111122223333:secret:dev/order-service/redis-auth" },
#   ]
# }
```

**Reference chain for each argument**:

| Argument | Source | Resolves To (Example) |
|----------|--------|----------------------|
| `vpc_id` | `module.vpc.vpc_id` | `vpc-0a1b2c3d4e5f6g7h8` |
| `private_subnets` | `module.vpc.private_subnet_ids` | `["subnet-001", "subnet-002", "subnet-003"]` |
| `cluster_id` | `module.ecs_cluster.cluster_id` | `arn:aws:ecs:us-east-1:111122223333:cluster/dev-ecs-cluster` |
| `alb_security_group_id` | `module.alb.alb_security_group_id` | `sg-0a1b2c3d4e5f6g7h8` |
| `listener_arn` | `module.alb.https_listener_arn` | `arn:aws:elasticloadbalancing:us-east-1:111122223333:listener/app/dev-alb/abc123/def456` |
| `execution_role_arn` | `module.iam.ecs_execution_role_arn` | `arn:aws:iam::111122223333:role/dev-ecs-execution-role` |
| `task_role_arn` | `module.iam.ecs_task_role_arn` | `arn:aws:iam::111122223333:role/dev-ecs-task-role` |
| `sns_alarm_arn` | `module.observability.sns_topic_arn` | `arn:aws:sns:us-east-1:111122223333:dev-infrastructure-alarms` |

**After adding this block**, the engineer runs:
```bash
cd terraform/environments/dev
terraform fmt -recursive ../../       # normalize HCL formatting
terraform validate                    # check syntax + reference errors
terraform plan -out=tfplan            # review all changes
terraform apply tfplan                # deploy
```

**Impact on existing resources**: None. This is a purely additive change. The new listener rule gets a new priority (must not conflict with existing). The new ECS service gets new tasks. Existing ALB, VPC, and cluster are unchanged.

---

## 10. FILE MAP

```
terraform/
│
├── README.md                                   — Operator manual: architecture overview, deploy guide, env comparison, CI/CD skeleton
├── .gitkeep                                    — Ensures terraform/ directory is tracked even when empty
│
├── bootstrap/
│   └── main.tf                                 — One-time setup: S3 state bucket (AES-256, versioned, public-blocked) + DynamoDB lock table (PITR)
│
├── modules/
│   ├── iam/
│   │   ├── main.tf                             — 4 IAM roles: ecs_execution, ecs_task, opensearch_access, flow_logs + policies
│   │   ├── variables.tf                        — environment, aws_region inputs
│   │   └── outputs.tf                          — 4 role ARNs
│   │
│   ├── vpc/
│   │   ├── main.tf                             — VPC, 3 public + 3 private subnets, IGW, 3 NAT GWs, 1 public RT + 3 per-AZ private RTs, flow logs
│   │   ├── variables.tf                        — vpc_cidr, subnets, flow_logs_role_arn, retention
│   │   └── outputs.tf                          — vpc_id, public/private subnet IDs, NAT GW IDs
│   │
│   ├── alb/
│   │   ├── main.tf                             — ALB, ALB SG, ACM cert (DNS wildcard), HTTP→HTTPS 301, HTTPS listener (TLS 1.3), access log S3 with ELB write policy
│   │   ├── variables.tf                        — environment, vpc_id, public_subnets, domain_name
│   │   └── outputs.tf                          — alb_arn, dns_name, zone_id, listener ARNs, SG ID, cert ARN + validation records
│   │
│   ├── ecs_cluster/
│   │   ├── main.tf                             — ECS cluster with Container Insights, FARGATE + FARGATE_SPOT capacity providers, shared reference SG
│   │   ├── variables.tf                        — environment, vpc_id
│   │   └── outputs.tf                          — cluster_id, cluster_name, cluster_security_group_id
│   │
│   ├── rds/
│   │   ├── main.tf                             — Aurora Serverless v2 PG 15.3, subnet group, SG (ingress :5432 from ECS SG), managed password, serverless scaling
│   │   ├── variables.tf                        — environment, identifier, vpc_id, subnets, db_name, db_username, ecs_sg_id, skip_snapshot, deletion_protection, backup, capacities
│   │   └── outputs.tf                          — cluster_endpoint, reader_endpoint, SG ID, master_user_secret_arn
│   │
│   ├── elasticache/
│   │   ├── main.tf                             — Redis cluster-mode replication group, SG (ingress :6379 from ECS SG), encrypted at rest + transit, AUTH token, slow-log CW
│   │   ├── variables.tf                        — environment, identifier, vpc_id, subnets, ecs_sg_id, auth_token (sensitive), node_type, num_node_groups, replicas
│   │   └── outputs.tf                          — cluster_endpoint, SG ID
│   │
│   ├── msk/
│   │   ├── main.tf                             — MSK Kafka 3.5.1, SG (ingress :9092-9094 from ECS SG), TLS client-broker, SASL/SCRAM, broker logs to CW
│   │   ├── variables.tf                        — environment, identifier, vpc_id, subnets, ecs_sg_id, broker count, instance type, EBS size, log retention
│   │   └── outputs.tf                          — bootstrap_brokers (plain/TLS/SASL), zookeeper string
│   │
│   ├── opensearch/
│   │   ├── main.tf                             — OpenSearch 2.11, SG (ingress :443 from ECS SG), VPC-only, HTTPS enforced (TLS 1.2), encrypt rest + node-to-node, fine-grained AC with IAM master user, domain access policy
│   │   ├── variables.tf                        — environment, identifier, vpc_id, subnets, aws_region, ecs_sg_id, opensearch_access_role_arn, instance type/count, EBS size
│   │   └── outputs.tf                          — domain_endpoint, dashboard_endpoint, SG ID
│   │
│   ├── microservice_base/
│   │   ├── main.tf                             — CW log group, task SG (ingress from ALB SG), task def (Fargate, awsvpc), target group (health check), ALB listener rule, ECS service (rolling deploy), auto-scaling target + CPU/memory policies, CPU/memory alarms
│   │   ├── variables.tf                        — 30 variables covering identity, networking, compute, IAM, scaling, config, secrets
│   │   └── outputs.tf                          — service_name, target_group_arn, SG ID, task_definition_arn
│   │
│   ├── observability/
│   │   ├── main.tf                             — SNS topic + email subs, ALB 5xx/4xx/latency alarms, RDS CPU alarms (for_each), MSK under-replication alarms (for_each), CW dashboard (ALB metrics 3-panel)
│   │   ├── variables.tf                        — environment, email endpoints, alb_arn_suffix, alarm thresholds (5xx, 4xx, latency), rds_cluster_ids map, msk_cluster_names map
│   │   └── outputs.tf                          — sns_topic_arn, dashboard_name
│   │
│   └── secrets/
│       ├── main.tf                             — [BLOCKED] AWS Secrets Manager entries for external secrets
│       ├── variables.tf                        — [BLOCKED]
│       └── outputs.tf                          — [BLOCKED]
│
└── environments/
    ├── dev/
    │   ├── main.tf                             — Root: wires iam→vpc→alb→ecs→observability→rds(3×)→msk→redis→opensearch + outputs
    │   ├── variables.tf                        — 8 variables: region, env, CIDRs, domain, redis token (sensitive), alarm emails
    │   └── terraform.tfvars                    — [BLOCKED] Default values for dev environment
    │
    ├── staging/
    │   ├── main.tf                             — Same structure as dev, larger instance types, 7-day backups, 60-day log retention
    │   ├── variables.tf                        — Same schema, different CIDR defaults (10.1.0.0/16)
    │   └── terraform.tfvars                    — [BLOCKED]
    │
    └── prod/
        ├── main.tf                             — Same structure, deletion_protection=true, final_snapshots, 30-day backups, tighter alarm thresholds
        ├── variables.tf                        — Same schema, different CIDR defaults (10.2.0.0/16)
        └── terraform.tfvars                    — [BLOCKED]
```

**Total: 44 files** (3 `.tfvars` + 3 secrets module files blocked by security policy, 38 files analyzed in full).

---

*Document generated from source at `terraform/` commit context. Every design decision, edge case, and line reference is traceable to the source files listed above.*
