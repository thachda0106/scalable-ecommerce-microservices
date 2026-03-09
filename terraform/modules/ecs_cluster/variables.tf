variable "environment" {
  type        = string
  description = "Environment name (e.g., dev, staging, prod)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID — required to create the shared ECS security group"
}
