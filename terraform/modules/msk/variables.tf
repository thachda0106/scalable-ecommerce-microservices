variable "environment" {
  type        = string
  description = "Environment name"
}

variable "identifier" {
  type        = string
  description = "Unique identifier for this MSK cluster (e.g. events)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the cluster will be deployed"
}

variable "private_subnets" {
  type        = list(string)
  description = "List of private subnet IDs — one per broker node"
}

variable "ecs_security_group_id" {
  type        = string
  description = "Security group ID of ECS tasks — the only source allowed to connect"
}

variable "number_of_broker_nodes" {
  type        = number
  default     = 3
  description = "Number of broker nodes — must be a multiple of the number of AZs"
}

variable "instance_type" {
  type        = string
  default     = "kafka.t3.small"
  description = "MSK broker instance type"
}

variable "ebs_volume_size" {
  type        = number
  default     = 100
  description = "EBS volume size in GiB per broker node"
}

variable "log_retention_days" {
  type        = number
  default     = 14
  description = "CloudWatch log retention for broker logs"
}
