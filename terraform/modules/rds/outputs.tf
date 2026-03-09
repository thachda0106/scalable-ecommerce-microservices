output "cluster_endpoint" {
  description = "Writer endpoint for the Aurora cluster"
  value       = aws_rds_cluster.main.endpoint
}

output "cluster_reader_endpoint" {
  description = "Read-only endpoint for the Aurora cluster"
  value       = aws_rds_cluster.main.reader_endpoint
}

output "security_group_id" {
  description = "Security group ID attached to the RDS cluster"
  value       = aws_security_group.rds.id
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret that holds the master user password"
  value       = aws_rds_cluster.main.master_user_secret[0].secret_arn
}
