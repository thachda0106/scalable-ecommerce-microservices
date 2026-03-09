output "rds_password_secret_arns" {
  description = "Map of RDS database identifier to its Secrets Manager secret ARN"
  value       = { for k, v in aws_secretsmanager_secret.rds_password : k => v.arn }
  sensitive   = true
}

output "redis_auth_secret_arns" {
  description = "Map of Redis cluster identifier to its Secrets Manager secret ARN"
  value       = { for k, v in aws_secretsmanager_secret.redis_auth : k => v.arn }
  sensitive   = true
}
