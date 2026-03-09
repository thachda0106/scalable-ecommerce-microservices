variable "environment" {
  type        = string
  description = "Environment name"
}

variable "service_name" {
  type        = string
  description = "Short name of the microservice (e.g. order-service, user-service)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the service will be deployed"
}

variable "private_subnets" {
  type        = list(string)
  description = "Private subnet IDs for ECS task ENIs"
}

variable "cluster_id" {
  type        = string
  description = "ECS cluster ID"
}

variable "cluster_name" {
  type        = string
  description = "ECS cluster name — used in auto-scaling resource ID and CloudWatch dimensions"
}

variable "alb_security_group_id" {
  type        = string
  description = "Security group ID of the ALB — tasks only accept traffic from this source"
}

variable "listener_arn" {
  type        = string
  description = "HTTPS listener ARN on the ALB"
}

variable "container_image" {
  type        = string
  description = "Full container image URI including tag (e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com/service:latest)"
}

variable "container_port" {
  type        = number
  description = "Port the container listens on"
}

variable "fargate_cpu" {
  type        = number
  default     = 256
  description = "Fargate CPU units (256 = 0.25 vCPU)"
}

variable "fargate_memory" {
  type        = number
  default     = 512
  description = "Fargate memory in MiB"
}

variable "execution_role_arn" {
  type        = string
  description = "IAM role ARN for the ECS task execution role"
}

variable "task_role_arn" {
  type        = string
  description = "IAM role ARN for the ECS task role (container permissions)"
}

variable "aws_region" {
  type        = string
  description = "AWS region — used in awslogs log driver configuration"
}

variable "health_check_path" {
  type        = string
  default     = "/health"
  description = "HTTP path the ALB uses for target health checks"
}

variable "path_pattern" {
  type        = string
  default     = "/*"
  description = "ALB listener rule path pattern (e.g. /api/orders/*)"
}

variable "listener_priority" {
  type        = number
  description = "Priority for the ALB listener rule — lower numbers evaluated first; must be unique per listener"
}

variable "desired_count" {
  type        = number
  default     = 2
  description = "Desired number of running tasks"
}

variable "min_tasks" {
  type        = number
  default     = 2
  description = "Minimum number of tasks for auto scaling"
}

variable "max_tasks" {
  type        = number
  default     = 10
  description = "Maximum number of tasks for auto scaling"
}

variable "cpu_target_utilization" {
  type        = number
  default     = 70
  description = "Target CPU utilization percentage for auto scaling"
}

variable "memory_target_utilization" {
  type        = number
  default     = 75
  description = "Target memory utilization percentage for auto scaling"
}

variable "log_retention_days" {
  type        = number
  default     = 14
  description = "CloudWatch log group retention in days"
}

variable "sns_alarm_arn" {
  type        = string
  default     = ""
  description = "SNS topic ARN for CloudWatch alarm notifications — leave empty to disable"
}

variable "environment_vars" {
  type = list(object({
    name  = string
    value = string
  }))
  default     = []
  description = "Non-sensitive environment variables injected into the container"
}

variable "secret_vars" {
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default     = []
  description = "Secrets Manager or SSM Parameter Store ARNs injected as environment variables"
}
