resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-${var.identifier}-subnet-group"
  subnet_ids = var.private_subnets

  tags = {
    Name = "${var.environment}-${var.identifier}-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.environment}-${var.identifier}-rds-sg"
  description = "Security group for RDS cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.environment}-${var.identifier}-rds-sg"
  }
}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

resource "aws_rds_cluster" "main" {
  cluster_identifier      = "${var.environment}-${var.identifier}-cluster"
  engine                  = "aurora-postgresql"
  engine_mode             = "provisioned"
  engine_version          = "15.3"
  database_name           = var.db_name
  master_username         = var.db_username
  master_password         = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  skip_final_snapshot     = true

  serverlessv2_scaling_configuration {
    max_capacity = 2.0
    min_capacity = 0.5
  }
}

resource "aws_rds_cluster_instance" "main" {
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}
