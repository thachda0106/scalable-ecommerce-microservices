output "service_name" {
  description = "The name of the ECS service"
  value       = aws_ecs_service.main.name
}

output "target_group_arn" {
  description = "ARN of the ALB target group"
  value       = aws_lb_target_group.main.arn
}

output "security_group_id" {
  description = "Security group ID of the ECS tasks — reference this in data-layer ingress rules if needed"
  value       = aws_security_group.ecs_tasks.id
}

output "task_definition_arn" {
  description = "ARN of the current task definition revision"
  value       = aws_ecs_task_definition.main.arn
}
