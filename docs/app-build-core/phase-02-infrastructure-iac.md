# Phase 2 — Infrastructure as Code (IaC)

> **Why this phase exists:** Infrastructure is the foundation everything runs on. If your Terraform
> is unstructured, your deployments become snowflakes — unique, fragile, and impossible to reproduce.
> This phase establishes reproducible, version-controlled infrastructure that any engineer can
> understand and any pipeline can deploy.

---

## 2.1 Terraform Project Structure

### The Golden Rule

> [!IMPORTANT]
> **Environments are NOT separate Terraform projects.** They are parameterized instances of the
> same modules. If dev and prod have different Terraform code, you're doing it wrong.

### Recommended Structure

```
terraform/
├── bootstrap/                       # One-time setup (S3 backend, DynamoDB lock)
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
│
├── modules/                         # Reusable, environment-agnostic modules
│   ├── networking/                  # VPC, subnets, IGW, NAT
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── ecs-cluster/                 # ECS cluster, capacity providers
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── ecs-service/                 # Per-service ECS task + service
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── templates/
│   │       └── task-definition.json
│   │
│   ├── rds/                         # PostgreSQL RDS
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── elasticache/                 # Redis cluster
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── msk/                         # Kafka (MSK)
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── opensearch/                  # OpenSearch domain
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── alb/                         # Application Load Balancer
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── cdn/                         # CloudFront distribution
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── dns/                         # Route53 hosted zones + records
│   │   └── ...
│   │
│   ├── waf/                         # WAF web ACL
│   │   └── ...
│   │
│   ├── s3/                          # S3 buckets (file uploads)
│   │   └── ...
│   │
│   ├── secrets/                     # Secrets Manager + Parameter Store
│   │   └── ...
│   │
│   ├── monitoring/                  # CloudWatch dashboards + alarms
│   │   └── ...
│   │
│   └── cicd/                        # CodePipeline / CodeBuild
│       └── ...
│
├── environments/                    # Environment-specific configurations
│   ├── dev/
│   │   ├── main.tf                  # Composes modules with dev params
│   │   ├── variables.tf
│   │   ├── terraform.tfvars         # Dev-specific values
│   │   ├── backend.tf               # Remote state config for dev
│   │   └── outputs.tf
│   │
│   ├── staging/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── terraform.tfvars
│   │   ├── backend.tf
│   │   └── outputs.tf
│   │
│   └── prod/
│       ├── main.tf
│       ├── variables.tf
│       ├── terraform.tfvars
│       ├── backend.tf
│       └── outputs.tf
│
└── README.md
```

### Why This Structure?

| Layer | Purpose |
|-------|---------|
| `bootstrap/` | Creates the S3 bucket + DynamoDB table for remote state. Run once, manually. |
| `modules/` | Reusable building blocks. Never contain environment-specific values. |
| `environments/` | Thin composition layers. Each env calls the SAME modules with DIFFERENT variables. |

---

## 2.2 Remote State

### Setup

```hcl
# bootstrap/main.tf — Run once to create state backend
resource "aws_s3_bucket" "terraform_state" {
  bucket = "ecommerce-terraform-state-${var.account_id}"

  versioning {
    enabled = true
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "aws:kms"
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-state-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

### Backend Configuration Per Environment

```hcl
# environments/prod/backend.tf
terraform {
  backend "s3" {
    bucket         = "ecommerce-terraform-state-123456789"
    key            = "prod/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "terraform-state-locks"
    encrypt        = true
  }
}
```

> [!WARNING]
> **Never store state locally.** Remote state with locking (DynamoDB) prevents concurrent
> modifications that corrupt infrastructure.

---

## 2.3 Networking Design

### VPC Architecture

```
┌─────────────────────────── VPC (10.0.0.0/16) ───────────────────────────┐
│                                                                          │
│  ┌──────── AZ-a ────────┐   ┌──────── AZ-b ────────┐   ┌── AZ-c ──┐   │
│  │                       │   │                       │   │           │   │
│  │  Public Subnet        │   │  Public Subnet        │   │  Public   │   │
│  │  10.0.1.0/24          │   │  10.0.2.0/24          │   │  10.0.3   │   │
│  │  ┌─────────────┐     │   │  ┌─────────────┐     │   │           │   │
│  │  │     ALB     │     │   │  │     ALB     │     │   │           │   │
│  │  │  (public)   │     │   │  │  (public)   │     │   │           │   │
│  │  └─────────────┘     │   │  └─────────────┘     │   │           │   │
│  │  ┌─────────────┐     │   │  ┌─────────────┐     │   │           │   │
│  │  │  NAT GW     │     │   │  │  NAT GW     │     │   │           │   │
│  │  └─────────────┘     │   │  └─────────────┘     │   │           │   │
│  │                       │   │                       │   │           │   │
│  │  Private Subnet       │   │  Private Subnet       │   │  Private  │   │
│  │  10.0.11.0/24         │   │  10.0.12.0/24         │   │  10.0.13  │   │
│  │  ┌─────────────┐     │   │  ┌─────────────┐     │   │           │   │
│  │  │ ECS Tasks   │     │   │  │ ECS Tasks   │     │   │           │   │
│  │  │ (services)  │     │   │  │ (services)  │     │   │           │   │
│  │  └─────────────┘     │   │  └─────────────┘     │   │           │   │
│  │                       │   │                       │   │           │   │
│  │  Data Subnet          │   │  Data Subnet          │   │  Data     │   │
│  │  10.0.21.0/24         │   │  10.0.22.0/24         │   │  10.0.23  │   │
│  │  ┌─────────────┐     │   │  ┌─────────────┐     │   │           │   │
│  │  │  RDS        │     │   │  │  RDS        │     │   │           │   │
│  │  │  Redis      │     │   │  │  (standby)  │     │   │           │   │
│  │  │  MSK        │     │   │  │             │     │   │           │   │
│  │  └─────────────┘     │   │  └─────────────┘     │   │           │   │
│  │                       │   │                       │   │           │   │
│  └───────────────────────┘   └───────────────────────┘   └───────────┘   │
│                                                                          │
│  Internet Gateway (attached to VPC)                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Subnet Strategy

| Subnet Type | CIDR Range | What Lives Here | Internet Access |
|-------------|-----------|-----------------|-----------------|
| **Public** | 10.0.1-3.0/24 | ALB, NAT Gateway, Bastion | Direct (IGW) |
| **Private** | 10.0.11-13.0/24 | ECS Tasks (all services) | Outbound only (NAT) |
| **Data** | 10.0.21-23.0/24 | RDS, ElastiCache, MSK, OpenSearch | None |

### Networking Module

```hcl
# modules/networking/main.tf
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project}-${var.environment}"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  public_subnets  = var.public_subnet_cidrs
  private_subnets = var.private_subnet_cidrs
  database_subnets = var.database_subnet_cidrs

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment == "dev" ? true : false  # Cost saving for dev
  enable_dns_hostnames   = true
  enable_dns_support     = true

  # Database subnet group
  create_database_subnet_group = true

  tags = {
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "terraform"
  }
}
```

---

## 2.4 Security Groups

### Security Group Architecture

```
Internet ──► SG: ALB (443) ──► SG: ECS (3000-3009) ──► SG: Data (5432, 6379, 9092)
              │                     │                        │
              │ Inbound: 443       │ Inbound: ALB SG       │ Inbound: ECS SG
              │ from 0.0.0.0/0    │ only                   │ only
              │                    │                        │
              │ NO direct access   │ NO internet access     │ NO internet access
              │ to services        │ to data tier           │ completely isolated
```

### Example

```hcl
# SG for ECS services — only accepts traffic from ALB
resource "aws_security_group" "ecs_services" {
  name_prefix = "${var.project}-ecs-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3009
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]  # Only from ALB
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]  # Outbound for NAT (npm, APIs, etc.)
  }
}

# SG for databases — only accepts traffic from ECS
resource "aws_security_group" "database" {
  name_prefix = "${var.project}-data-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_services.id]
  }

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_services.id]
  }
}
```

---

## 2.5 Load Balancer

### ALB Configuration

```hcl
# modules/alb/main.tf
resource "aws_lb" "main" {
  name               = "${var.project}-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets           = var.public_subnet_ids

  enable_deletion_protection = var.environment == "prod" ? true : false

  access_logs {
    bucket  = var.access_logs_bucket
    enabled = true
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = var.api_gateway_target_group_arn
  }
}
```

### Target Group Per Service (for direct routing) or Single Target (API Gateway)

```
Option A: ALB → API Gateway → Services (Recommended)
  - Single target group for API Gateway
  - API Gateway handles internal routing
  - Simpler ALB configuration

Option B: ALB → Services directly (path-based routing)
  - /api/products/* → Product Service target group
  - /api/orders/* → Order Service target group
  - More ALB rules, but eliminates API Gateway bottleneck
```

**Our choice:** Option A — ALB routes everything to the API Gateway.

---

## 2.6 ECS / Fargate

### ECS Cluster Module

```hcl
# modules/ecs-cluster/main.tf
resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      log_configuration {
        cloud_watch_log_group_name = "/ecs/${var.project}-${var.environment}"
      }
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }

  default_capacity_provider_strategy {
    weight            = 3
    capacity_provider = "FARGATE_SPOT"  # 70% cost reduction for non-critical
  }
}
```

### ECS Service Module (Reusable Per Service)

```hcl
# modules/ecs-service/main.tf
resource "aws_ecs_task_definition" "service" {
  family                   = "${var.project}-${var.service_name}-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name  = var.service_name
      image = "${var.ecr_repo_url}:${var.image_tag}"
      portMappings = [{
        containerPort = var.container_port
        protocol      = "tcp"
      }]
      environment = var.environment_variables
      secrets     = var.secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/${var.project}/${var.service_name}"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = var.environment
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

resource "aws_ecs_service" "service" {
  name            = "${var.service_name}-${var.environment}"
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.service.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups = [var.ecs_security_group_id]
    subnets         = var.private_subnet_ids
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = var.service_name
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  service_registries {
    registry_arn = aws_service_discovery_service.this.arn
  }
}
```

### Environment Composition

```hcl
# environments/prod/main.tf
module "api_gateway" {
  source = "../../modules/ecs-service"

  project        = "ecommerce"
  environment    = "prod"
  service_name   = "api-gateway"
  container_port = 3000
  cpu            = 512
  memory         = 1024
  desired_count  = 3
  image_tag      = var.api_gateway_image_tag

  environment_variables = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3000" },
  ]

  secrets = [
    { name = "JWT_SECRET", valueFrom = "arn:aws:secretsmanager:..." },
  ]
}

module "order_service" {
  source = "../../modules/ecs-service"

  project        = "ecommerce"
  environment    = "prod"
  service_name   = "order-service"
  container_port = 3006
  cpu            = 1024
  memory         = 2048
  desired_count  = 5     # Higher for order processing
  image_tag      = var.order_service_image_tag
  # ...
}
```

---

## 2.7 Database (RDS / PostgreSQL)

```hcl
# modules/rds/main.tf
resource "aws_db_instance" "main" {
  identifier = "${var.project}-${var.service_name}-${var.environment}"

  engine         = "postgres"
  engine_version = "16.1"
  instance_class = var.instance_class  # db.r6g.large for prod

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage  # Auto-scaling
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  vpc_security_group_ids = [var.database_security_group_id]
  db_subnet_group_name   = var.database_subnet_group_name

  multi_az            = var.environment == "prod" ? true : false
  deletion_protection = var.environment == "prod" ? true : false

  backup_retention_period = var.environment == "prod" ? 30 : 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = var.enhanced_monitoring_role_arn

  parameter_group_name = aws_db_parameter_group.main.name

  tags = {
    Service     = var.service_name
    Environment = var.environment
  }
}
```

### Database Per Service Mapping

| Service | Database | Instance Class (Prod) | Multi-AZ |
|---------|----------|----------------------|----------|
| User Service | `ecommerce-user-prod` | db.r6g.large | Yes |
| Product Service | `ecommerce-product-prod` | db.r6g.xlarge | Yes |
| Order Service | `ecommerce-order-prod` | db.r6g.xlarge | Yes |
| Inventory Service | `ecommerce-inventory-prod` | db.r6g.large | Yes |
| Payment Service | `ecommerce-payment-prod` | db.r6g.large | Yes |

---

## 2.8 Redis (ElastiCache)

```hcl
# modules/elasticache/main.tf
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project}-${var.environment}"
  description          = "Redis cluster for ${var.project}"

  node_type            = var.node_type  # cache.r6g.large
  num_cache_clusters   = var.environment == "prod" ? 3 : 1
  port                 = 6379

  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.redis_security_group_id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = random_password.redis_auth.result

  automatic_failover_enabled = var.environment == "prod" ? true : false
  multi_az_enabled           = var.environment == "prod" ? true : false

  snapshot_retention_limit = var.environment == "prod" ? 7 : 1
  snapshot_window          = "03:00-05:00"
}
```

---

## 2.9 Kafka (MSK)

```hcl
# modules/msk/main.tf
resource "aws_msk_cluster" "main" {
  cluster_name           = "${var.project}-${var.environment}"
  kafka_version          = "3.5.1"
  number_of_broker_nodes = var.environment == "prod" ? 6 : 3

  broker_node_group_info {
    instance_type   = var.broker_instance_type  # kafka.m5.large
    client_subnets  = var.data_subnet_ids
    security_groups = [var.msk_security_group_id]

    storage_info {
      ebs_storage_info {
        volume_size = var.ebs_volume_size  # 1000 GB for prod
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
    encryption_at_rest_kms_key_arn = var.kms_key_arn
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = "/msk/${var.project}-${var.environment}"
      }
    }
  }
}

resource "aws_msk_configuration" "main" {
  name              = "${var.project}-${var.environment}"
  kafka_versions    = ["3.5.1"]

  server_properties = <<PROPERTIES
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
num.partitions=6
log.retention.hours=168
PROPERTIES
}
```

---

## 2.10 OpenSearch

```hcl
# modules/opensearch/main.tf
resource "aws_opensearch_domain" "main" {
  domain_name    = "${var.project}-${var.environment}"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type          = var.instance_type  # r6g.large.search
    instance_count         = var.environment == "prod" ? 3 : 1
    zone_awareness_enabled = var.environment == "prod" ? true : false

    zone_awareness_config {
      availability_zone_count = var.environment == "prod" ? 3 : 1
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_size = var.ebs_volume_size  # 100 GB
    volume_type = "gp3"
  }

  encrypt_at_rest {
    enabled    = true
    kms_key_id = var.kms_key_arn
  }

  node_to_node_encryption {
    enabled = true
  }

  vpc_options {
    subnet_ids         = var.data_subnet_ids
    security_group_ids = [var.opensearch_security_group_id]
  }
}
```

---

## 2.11 S3, CloudFront, Route53, WAF

### S3 for File Uploads

```hcl
resource "aws_s3_bucket" "uploads" {
  bucket = "${var.project}-uploads-${var.environment}"
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = var.allowed_origins
    max_age_seconds = 3600
  }
}
```

### CloudFront CDN

```hcl
resource "aws_cloudfront_distribution" "main" {
  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    domain_name = aws_s3_bucket.uploads.bucket_regional_domain_name
    origin_id   = "s3-uploads"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "alb"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Host"]
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0         # API responses not cached at CDN
    max_ttl                = 0
  }

  ordered_cache_behavior {
    path_pattern     = "/uploads/*"
    target_origin_id = "s3-uploads"

    forwarded_values {
      query_string = false
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 86400      # 1 day
    default_ttl            = 604800     # 7 days
    max_ttl                = 2592000    # 30 days
  }

  web_acl_id = aws_wafv2_web_acl.main.arn

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn = var.acm_certificate_arn
    ssl_support_method  = "sni-only"
  }
}
```

### WAF

```hcl
resource "aws_wafv2_web_acl" "main" {
  name  = "${var.project}-${var.environment}"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate limiting
  rule {
    name     = "rate-limit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
    }
  }

  # AWS Managed Rules
  rule {
    name     = "aws-managed-common"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRules"
    }
  }

  # SQL Injection protection
  rule {
    name     = "sql-injection"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLInjection"
    }
  }
}
```

---

## 2.12 Secrets Manager & Parameter Store

### What Goes Where

| Store | What | Example |
|-------|------|---------|
| **Secrets Manager** | Sensitive, rotatable | DB passwords, API keys, JWT secrets |
| **Parameter Store** | Non-sensitive config | Service URLs, feature flags, retry counts |

```hcl
# Secrets
resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "${var.project}/${var.environment}/jwt-secret"
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${var.project}/${var.environment}/${var.service_name}/db-credentials"
}

# Parameters
resource "aws_ssm_parameter" "kafka_brokers" {
  name  = "/${var.project}/${var.environment}/kafka/brokers"
  type  = "String"
  value = module.msk.bootstrap_brokers_tls
}

resource "aws_ssm_parameter" "redis_endpoint" {
  name  = "/${var.project}/${var.environment}/redis/endpoint"
  type  = "String"
  value = module.elasticache.primary_endpoint_address
}
```

---

## 2.13 Service Discovery

### AWS Cloud Map

```hcl
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${var.project}.${var.environment}.local"
  vpc  = module.vpc.vpc_id
}

resource "aws_service_discovery_service" "service" {
  name = var.service_name

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}
```

This allows services to find each other at:
```
auth-service.ecommerce.prod.local
user-service.ecommerce.prod.local
product-service.ecommerce.prod.local
```

---

## 2.14 Auto-Scaling

```hcl
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_capacity    # 20 for prod
  min_capacity       = var.min_capacity    # 2 for prod
  resource_id        = "service/${var.ecs_cluster_name}/${var.ecs_service_name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale on CPU
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.service_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale on request count
resource "aws_appautoscaling_policy" "requests" {
  name               = "${var.service_name}-request-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = var.alb_resource_label
    }
    target_value       = 1000.0    # Requests per target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### Auto-Scaling Targets Per Service

| Service | Min | Max | Scale On |
|---------|-----|-----|----------|
| API Gateway | 3 | 20 | CPU 60%, Request count |
| Order Service | 3 | 30 | CPU 60%, Kafka lag |
| Product Service | 2 | 10 | CPU 60% |
| Search Service | 2 | 10 | CPU 60% |
| Inventory Service | 3 | 20 | CPU 60%, Kafka lag |
| Cart Service | 2 | 15 | CPU 60% |

---

## 2.15 Blue/Green Deployment

### ECS Blue/Green with CodeDeploy

```hcl
resource "aws_codedeploy_deployment_group" "main" {
  app_name               = aws_codedeploy_app.main.name
  deployment_group_name  = "${var.service_name}-${var.environment}"
  service_role_arn       = var.codedeploy_role_arn
  deployment_config_name = "CodeDeployDefault.ECSAllAtOnce"

  auto_rollback_configuration {
    enabled = true
    events  = ["DEPLOYMENT_FAILURE"]
  }

  blue_green_deployment_config {
    deployment_ready_option {
      action_on_timeout = "CONTINUE_DEPLOYMENT"
    }

    terminate_blue_instances_on_deployment_success {
      action                           = "TERMINATE"
      termination_wait_time_in_minutes = 5
    }
  }

  deployment_style {
    deployment_option = "WITH_TRAFFIC_CONTROL"
    deployment_type   = "BLUE_GREEN"
  }

  ecs_service {
    cluster_name = var.ecs_cluster_name
    service_name = var.ecs_service_name
  }

  load_balancer_info {
    target_group_pair_info {
      prod_traffic_route {
        listener_arns = [var.listener_arn]
      }

      target_group {
        name = var.blue_target_group_name
      }

      target_group {
        name = var.green_target_group_name
      }
    }
  }
}
```

---

## 2.16 Environment Sizing

| Resource | Dev | Staging | Prod |
|----------|-----|---------|------|
| **ECS Tasks** | 1 per service | 2 per service | 3-30 per service |
| **RDS** | db.t3.micro | db.t3.medium | db.r6g.large (Multi-AZ) |
| **Redis** | cache.t3.micro (1) | cache.t3.medium (1) | cache.r6g.large (3) |
| **MSK Brokers** | 3 (kafka.t3.small) | 3 (kafka.m5.large) | 6 (kafka.m5.large) |
| **OpenSearch** | 1 (t3.small) | 2 (r6g.large) | 3 (r6g.large, 3-AZ) |
| **NAT Gateway** | 1 (single AZ) | 1 | 3 (one per AZ) |
| **Cost/Month** | ~$200 | ~$1,500 | ~$8,000+ |

---

## Common Mistakes

> [!CAUTION]
> - **Hardcoding values** instead of using variables. Your dev RDS password should NOT be in git.
> - **No remote state locking.** Two engineers running `terraform apply` simultaneously = corruption.
> - **Single NAT Gateway in prod.** If it goes down, all private subnets lose internet.
> - **Oversized dev environments.** Use t3.micro/small for dev. You're not load-testing locally.
> - **No deletion protection** on prod databases. One wrong `terraform destroy` away from disaster.
> - **Security groups that are too permissive.** Never use `0.0.0.0/0` for ingress on anything
>   except the ALB on port 443.

---

## Summary — What This Phase Delivers

| Deliverable | Check |
|------------|-------|
| Terraform project structure with modules | ✅ |
| Remote state with S3 + DynamoDB locking | ✅ |
| VPC with public, private, data subnets across 3 AZs | ✅ |
| Security groups layered (ALB → ECS → Data) | ✅ |
| ECS Fargate cluster with auto-scaling | ✅ |
| RDS PostgreSQL per service (Multi-AZ in prod) | ✅ |
| ElastiCache Redis cluster | ✅ |
| MSK Kafka cluster | ✅ |
| OpenSearch domain | ✅ |
| S3 + CloudFront CDN | ✅ |
| WAF with rate limiting + managed rules | ✅ |
| Service discovery via Cloud Map | ✅ |
| Blue/Green deployment via CodeDeploy | ✅ |

---

> **Next →** [Phase 3 — Platform / Core Shared Modules](./phase-03-platform-core-modules.md)
