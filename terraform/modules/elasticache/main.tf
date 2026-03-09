resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-${var.identifier}-redis-subnet-group"
  subnet_ids = var.private_subnets
}

# ---------------------------------------------------------------------------
# Security Group — principle of least privilege
# Only the shared ECS security group is allowed to reach Redis.
# ---------------------------------------------------------------------------

resource "aws_security_group" "redis" {
  name        = "${var.environment}-${var.identifier}-redis-sg"
  description = "Security group for Redis cluster — allows inbound only from ECS tasks"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.environment}-${var.identifier}-redis-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_ecs" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = var.ecs_security_group_id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "Redis from ECS tasks"
}

resource "aws_vpc_security_group_egress_rule" "redis_egress" {
  security_group_id = aws_security_group.redis.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---------------------------------------------------------------------------
# CloudWatch Log Group for slow-log delivery
# Must exist before the replication group references it.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "redis_slow_logs" {
  name              = "/aws/elasticache/${var.environment}-${var.identifier}/slow-logs"
  retention_in_days = 14

  tags = { Name = "${var.environment}-${var.identifier}-redis-slow-logs" }
}

# ---------------------------------------------------------------------------
# Redis Replication Group
# Cluster mode enabled, multi-AZ, encrypted in transit + at rest, AUTH token.
# ---------------------------------------------------------------------------

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.environment}-${var.identifier}-cluster"
  description          = "Redis cluster for ${var.identifier} — cluster mode, multi-AZ"

  node_type                  = var.node_type
  port                       = 6379
  parameter_group_name       = "default.redis7.cluster.on"
  automatic_failover_enabled = true
  multi_az_enabled           = true

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  num_node_groups         = var.num_node_groups
  replicas_per_node_group = var.replicas_per_node_group

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.auth_token

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_logs.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  depends_on = [aws_cloudwatch_log_group.redis_slow_logs]
}
