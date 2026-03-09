output "cluster_endpoint" {
  description = "Redis cluster configuration endpoint (cluster mode)"
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address
}

output "security_group_id" {
  description = "Security group ID attached to the Redis cluster"
  value       = aws_security_group.redis.id
}
