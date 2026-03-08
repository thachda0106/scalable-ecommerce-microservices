output "service_name" {
  description = "The name of the service"
  value       = aws_ecs_service.main.name
}

output "target_group_arn" {
  description = "The ARN of the target group"
  value       = aws_lb_target_group.main.arn
}
