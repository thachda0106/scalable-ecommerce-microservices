data "aws_vpc" "selected" {
  id = var.vpc_id
}

data "aws_caller_identity" "current" {}

resource "aws_security_group" "opensearch" {
  name        = "${var.environment}-${var.identifier}-os-sg"
  description = "Security group for OpenSearch cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
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

resource "aws_opensearch_domain" "main" {
  domain_name    = "${var.environment}-${var.identifier}"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type          = "t3.small.search"
    instance_count         = 3
    zone_awareness_enabled = true
    zone_awareness_config {
      availability_zone_count = 3
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_size = 20
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

  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action   = "es:*"
        Resource = "arn:aws:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/${var.environment}-${var.identifier}/*"
      }
    ]
  })
}
