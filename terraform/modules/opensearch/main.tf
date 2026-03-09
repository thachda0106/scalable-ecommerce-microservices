data "aws_vpc" "selected" {
  id = var.vpc_id
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Security Group — allow HTTPS only from ECS tasks
# ---------------------------------------------------------------------------

resource "aws_security_group" "opensearch" {
  name        = "${var.environment}-${var.identifier}-os-sg"
  description = "Security group for OpenSearch cluster — allows HTTPS from ECS tasks only"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.environment}-${var.identifier}-os-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "opensearch_from_ecs" {
  security_group_id            = aws_security_group.opensearch.id
  referenced_security_group_id = var.ecs_security_group_id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
  description                  = "HTTPS from ECS tasks"
}

resource "aws_vpc_security_group_egress_rule" "opensearch_egress" {
  security_group_id = aws_security_group.opensearch.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---------------------------------------------------------------------------
# OpenSearch Domain
# Fine-grained access control enabled. The opensearch_access_role_arn is
# the master user — only that role can perform administrative operations.
# ---------------------------------------------------------------------------

resource "aws_opensearch_domain" "main" {
  domain_name    = "${var.environment}-${var.identifier}"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type          = var.instance_type
    instance_count         = var.instance_count
    zone_awareness_enabled = true

    zone_awareness_config {
      availability_zone_count = 3
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_size = var.ebs_volume_size
    volume_type = "gp3"
  }

  vpc_options {
    subnet_ids         = var.private_subnets
    security_group_ids = [aws_security_group.opensearch.id]
  }

  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  # Fine-grained access control — anonymous auth disabled, IAM role as master user
  advanced_security_options {
    enabled                        = true
    anonymous_auth_enabled         = false
    internal_user_database_enabled = false

    master_user_options {
      master_user_arn = var.opensearch_access_role_arn
    }
  }

  # Restrict domain access to the designated IAM role only
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = var.opensearch_access_role_arn }
      Action    = "es:*"
      Resource  = "arn:aws:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/${var.environment}-${var.identifier}/*"
    }]
  })
}
