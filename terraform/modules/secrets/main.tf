# ---------------------------------------------------------------------------
# Secrets Manager — RDS master passwords
# One secret per RDS database. The password value is provided by the caller
# and stored encrypted in Secrets Manager so it never appears in task
# environment variables or Terraform state in plaintext.
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "rds_password" {
  for_each = var.rds_databases

  name                    = "${var.environment}/rds/${each.key}/master-password"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = {
    Name = "${var.environment}-${each.key}-rds-password"
  }
}

resource "aws_secretsmanager_secret_version" "rds_password" {
  for_each = var.rds_databases

  secret_id     = aws_secretsmanager_secret.rds_password[each.key].id
  secret_string = each.value.password
}

# ---------------------------------------------------------------------------
# Secrets Manager — Redis AUTH tokens
# One secret per Redis cluster. The auth token must be ≥16 characters and
# is required when transit_encryption_enabled = true.
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "redis_auth" {
  for_each = var.redis_clusters

  name                    = "${var.environment}/redis/${each.key}/auth-token"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = {
    Name = "${var.environment}-${each.key}-redis-auth"
  }
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  for_each = var.redis_clusters

  secret_id     = aws_secretsmanager_secret.redis_auth[each.key].id
  secret_string = each.value.auth_token
}
