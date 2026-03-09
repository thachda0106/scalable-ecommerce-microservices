output "ecs_execution_role_arn" {
  description = "ARN of the ECS task execution role — passed to task definitions"
  value       = aws_iam_role.ecs_execution.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the generic ECS task role — passed to task definitions"
  value       = aws_iam_role.ecs_task.arn
}

output "opensearch_access_role_arn" {
  description = "ARN of the OpenSearch access role — used as the domain master user"
  value       = aws_iam_role.opensearch_access.arn
}

output "flow_logs_role_arn" {
  description = "ARN of the VPC Flow Logs IAM role — passed to the VPC module"
  value       = aws_iam_role.flow_logs.arn
}
