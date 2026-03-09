output "cluster_id" {
  description = "The ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "The name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "cluster_security_group_id" {
  description = "Shared ECS security group ID — reference this in data-layer ingress rules"
  value       = aws_security_group.ecs_shared.id
}
