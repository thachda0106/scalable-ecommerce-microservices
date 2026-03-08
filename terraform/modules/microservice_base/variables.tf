variable "environment" { type = string }
variable "service_name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnets" { type = list(string) }
variable "cluster_id" { type = string }
variable "alb_security_group_id" { type = string }
variable "listener_arn" { type = string }

variable "container_image" { type = string }
variable "container_port" { type = number }
variable "fargate_cpu" { type = number }
variable "fargate_memory" { type = number }
variable "execution_role_arn" { type = string }
variable "task_role_arn" { type = string }
variable "aws_region" { type = string }

variable "health_check_path" {
  type    = string
  default = "/health"
}
variable "path_pattern" {
  type    = string
  default = "/*"
}
variable "listener_priority" { type = number }
variable "desired_count" {
  type    = number
  default = 2
}
variable "environment_vars" {
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}
