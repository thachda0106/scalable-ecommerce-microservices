resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-${var.identifier}-subnet-group"
  subnet_ids = var.private_subnets

  tags = { Name = "${var.environment}-${var.identifier}-subnet-group" }
}

# ---------------------------------------------------------------------------
# Security Group — allow PostgreSQL only from ECS tasks
# ---------------------------------------------------------------------------

resource "aws_security_group" "rds" {
  name        = "${var.environment}-${var.identifier}-rds-sg"
  description = "Security group for RDS Aurora cluster — allow from ECS tasks only"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.environment}-${var.identifier}-rds-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = var.ecs_security_group_id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL from ECS tasks"
}

resource "aws_vpc_security_group_egress_rule" "rds_egress" {
  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---------------------------------------------------------------------------
# Aurora Serverless v2 Cluster
# manage_master_user_password = true delegates password management to AWS
# Secrets Manager, avoiding the password appearing in Terraform state.
# ---------------------------------------------------------------------------

resource "aws_rds_cluster" "main" {
  cluster_identifier = "${var.environment}-${var.identifier}-cluster"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = "15.3"
  database_name      = var.db_name
  master_username    = var.db_username

  # AWS manages the password in Secrets Manager — no plaintext in state
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.environment}-${var.identifier}-final-snapshot"

  deletion_protection     = var.deletion_protection
  storage_encrypted       = true
  backup_retention_period = var.backup_retention_period
  preferred_backup_window = "02:00-03:00"

  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }
}

# ---------------------------------------------------------------------------
# Cluster Instance — db.serverless uses Serverless v2 scaling
# ---------------------------------------------------------------------------

resource "aws_rds_cluster_instance" "main" {
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}
