# ---------------------------------------------------------------------------
# Security Group — allow Kafka ports only from ECS tasks
# ---------------------------------------------------------------------------

resource "aws_security_group" "msk" {
  name        = "${var.environment}-${var.identifier}-msk-sg"
  description = "Security group for MSK cluster — allows Kafka ports from ECS tasks only"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.environment}-${var.identifier}-msk-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "msk_from_ecs" {
  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = var.ecs_security_group_id
  from_port                    = 9092
  to_port                      = 9094
  ip_protocol                  = "tcp"
  description                  = "Kafka plaintext (9092), TLS (9093), SASL (9094) from ECS tasks"
}

resource "aws_vpc_security_group_egress_rule" "msk_egress" {
  security_group_id = aws_security_group.msk.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---------------------------------------------------------------------------
# CloudWatch Log Group for broker logs
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "msk_logs" {
  name              = "/aws/msk/${var.environment}-${var.identifier}"
  retention_in_days = var.log_retention_days

  tags = { Name = "${var.environment}-${var.identifier}-msk-logs" }
}

# ---------------------------------------------------------------------------
# MSK Cluster
# TLS-only client-broker encryption, SASL/SCRAM auth, broker logs to CW.
# ---------------------------------------------------------------------------

resource "aws_msk_cluster" "main" {
  cluster_name           = "${var.environment}-${var.identifier}-cluster"
  kafka_version          = "3.5.1"
  number_of_broker_nodes = var.number_of_broker_nodes

  broker_node_group_info {
    instance_type   = var.instance_type
    client_subnets  = var.private_subnets
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.ebs_volume_size
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  client_authentication {
    sasl {
      scram = true
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk_logs.name
      }
    }
  }

  depends_on = [aws_cloudwatch_log_group.msk_logs]
}
