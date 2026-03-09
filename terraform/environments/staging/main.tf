terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "ecommerce-platform-terraform-state"
    key            = "ecommerce-platform/staging/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "ecommerce-platform-terraform-locks"
  }

  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "ecommerce-platform"
      ManagedBy   = "terraform"
    }
  }
}

# ---------------------------------------------------------------------------
# IAM Roles
# ---------------------------------------------------------------------------

module "iam" {
  source      = "../../modules/iam"
  environment = var.environment
  aws_region  = var.aws_region
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

module "vpc" {
  source = "../../modules/vpc"

  vpc_cidr                 = var.vpc_cidr
  environment              = var.environment
  public_subnets_cidr      = var.public_subnets_cidr
  private_subnets_cidr     = var.private_subnets_cidr
  flow_logs_role_arn       = module.iam.flow_logs_role_arn
  flow_logs_retention_days = 60
}

# ---------------------------------------------------------------------------
# Application Load Balancer
# ---------------------------------------------------------------------------

module "alb" {
  source = "../../modules/alb"

  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  public_subnets = module.vpc.public_subnet_ids
  domain_name    = var.domain_name
}

# ---------------------------------------------------------------------------
# ECS Cluster
# ---------------------------------------------------------------------------

module "ecs_cluster" {
  source = "../../modules/ecs_cluster"

  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}

# ---------------------------------------------------------------------------
# Observability
# ---------------------------------------------------------------------------

module "observability" {
  source = "../../modules/observability"

  environment           = var.environment
  alb_arn_suffix        = module.alb.alb_arn_suffix
  alarm_email_endpoints = var.alarm_email_endpoints

  rds_cluster_ids = {
    orders   = module.rds_orders.cluster_endpoint
    users    = module.rds_users.cluster_endpoint
    products = module.rds_products.cluster_endpoint
  }
}

# ---------------------------------------------------------------------------
# RDS Aurora Serverless v2
# Larger capacity window and longer backup retention than dev.
# ---------------------------------------------------------------------------

module "rds_orders" {
  source = "../../modules/rds"

  environment             = var.environment
  identifier              = "orders"
  vpc_id                  = module.vpc.vpc_id
  private_subnets         = module.vpc.private_subnet_ids
  db_name                 = "orders_db"
  db_username             = "orders_admin"
  ecs_security_group_id   = module.ecs_cluster.cluster_security_group_id
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 7
  min_capacity            = 0.5
  max_capacity            = 4.0
}

module "rds_users" {
  source = "../../modules/rds"

  environment             = var.environment
  identifier              = "users"
  vpc_id                  = module.vpc.vpc_id
  private_subnets         = module.vpc.private_subnet_ids
  db_name                 = "users_db"
  db_username             = "users_admin"
  ecs_security_group_id   = module.ecs_cluster.cluster_security_group_id
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 7
  min_capacity            = 0.5
  max_capacity            = 4.0
}

module "rds_products" {
  source = "../../modules/rds"

  environment             = var.environment
  identifier              = "products"
  vpc_id                  = module.vpc.vpc_id
  private_subnets         = module.vpc.private_subnet_ids
  db_name                 = "products_db"
  db_username             = "products_admin"
  ecs_security_group_id   = module.ecs_cluster.cluster_security_group_id
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 7
  min_capacity            = 0.5
  max_capacity            = 4.0
}

# ---------------------------------------------------------------------------
# MSK Kafka
# ---------------------------------------------------------------------------

module "msk" {
  source = "../../modules/msk"

  environment            = var.environment
  identifier             = "events"
  vpc_id                 = module.vpc.vpc_id
  private_subnets        = module.vpc.private_subnet_ids
  ecs_security_group_id  = module.ecs_cluster.cluster_security_group_id
  number_of_broker_nodes = 3
  instance_type          = "kafka.m5.large"
  ebs_volume_size        = 200
  log_retention_days     = 30
}

# ---------------------------------------------------------------------------
# ElastiCache Redis
# ---------------------------------------------------------------------------

module "redis" {
  source = "../../modules/elasticache"

  environment             = var.environment
  identifier              = "session"
  vpc_id                  = module.vpc.vpc_id
  private_subnets         = module.vpc.private_subnet_ids
  ecs_security_group_id   = module.ecs_cluster.cluster_security_group_id
  auth_token              = var.redis_auth_token
  node_type               = "cache.t4g.small"
  num_node_groups         = 2
  replicas_per_node_group = 1
}

# ---------------------------------------------------------------------------
# OpenSearch
# ---------------------------------------------------------------------------

module "opensearch" {
  source = "../../modules/opensearch"

  environment                = var.environment
  identifier                 = "search"
  vpc_id                     = module.vpc.vpc_id
  private_subnets            = module.vpc.private_subnet_ids
  aws_region                 = var.aws_region
  ecs_security_group_id      = module.ecs_cluster.cluster_security_group_id
  opensearch_access_role_arn = module.iam.opensearch_access_role_arn
  instance_type              = "m5.large.search"
  instance_count             = 3
  ebs_volume_size            = 50
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "acm_validation_records" {
  description = "DNS records required to validate the ACM certificate"
  value       = module.alb.acm_certificate_domain_validation_options
}

output "ecs_cluster_name" {
  value = module.ecs_cluster.cluster_name
}

output "orders_db_endpoint" {
  value = module.rds_orders.cluster_endpoint
}

output "users_db_endpoint" {
  value = module.rds_users.cluster_endpoint
}

output "products_db_endpoint" {
  value = module.rds_products.cluster_endpoint
}

output "redis_endpoint" {
  value = module.redis.cluster_endpoint
}

output "opensearch_endpoint" {
  value = module.opensearch.domain_endpoint
}

output "msk_bootstrap_brokers_tls" {
  value = module.msk.bootstrap_brokers_tls
}

output "sns_alarm_topic_arn" {
  value = module.observability.sns_topic_arn
}
