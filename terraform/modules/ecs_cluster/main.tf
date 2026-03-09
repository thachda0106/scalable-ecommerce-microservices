resource "aws_ecs_cluster" "main" {
  name = "${var.environment}-ecs-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ---------------------------------------------------------------------------
# Shared ECS Security Group
# This group is attached to no task directly — it is used as the ingress
# source reference in RDS, Redis, MSK, and OpenSearch security group rules.
# Each microservice's own task SG is separate (created in microservice_base)
# but inherits from this one conceptually so data-layer rules stay simple.
# ---------------------------------------------------------------------------

resource "aws_security_group" "ecs_shared" {
  name        = "${var.environment}-ecs-shared-sg"
  description = "Reference SG for ECS tasks — used as source in data-layer security group ingress rules"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = { Name = "${var.environment}-ecs-shared-sg" }
}
