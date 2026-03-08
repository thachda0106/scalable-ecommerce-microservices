resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-${var.identifier}-redis-subnet-group"
  subnet_ids = var.private_subnets
}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

resource "aws_security_group" "redis" {
  name        = "${var.environment}-${var.identifier}-redis-sg"
  description = "Security group for Redis cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.environment}-${var.identifier}-cluster"
  description                = "Redis cluster for ${var.identifier}"
  node_type                  = "cache.t4g.micro"
  port                       = 6379
  parameter_group_name       = "default.redis7.cluster.on"
  automatic_failover_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]

  replicas_per_node_group = 1
  num_node_groups         = 2
}
