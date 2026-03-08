output "cluster_endpoint" {
  description = "Redis configuration endpoint"
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address
}
