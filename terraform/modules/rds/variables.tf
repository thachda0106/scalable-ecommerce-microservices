variable "environment" {
  type        = string
  description = "Environment name"
}

variable "identifier" {
  type        = string
  description = "Unique identifier for this RDS cluster (e.g. orders, users, products)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the cluster will be deployed"
}

variable "private_subnets" {
  type        = list(string)
  description = "List of private subnet IDs — must span at least two AZs"
}

variable "db_name" {
  type        = string
  description = "Name of the initial database created when the cluster is provisioned"
}

variable "db_username" {
  type        = string
  description = "Master username for the database cluster"
}

variable "ecs_security_group_id" {
  type        = string
  description = "Security group ID of ECS tasks — the only source allowed to connect"
}

variable "skip_final_snapshot" {
  type        = bool
  default     = true
  description = "Set to false in production to take a final snapshot before cluster deletion"
}

variable "deletion_protection" {
  type        = bool
  default     = false
  description = "Enable deletion protection — set to true in production"
}

variable "backup_retention_period" {
  type        = number
  default     = 7
  description = "Number of days to retain automated backups"
}

variable "min_capacity" {
  type        = number
  default     = 0.5
  description = "Minimum Serverless v2 capacity in ACUs (0.5 allows scale-to-near-zero)"
}

variable "max_capacity" {
  type        = number
  default     = 4.0
  description = "Maximum Serverless v2 capacity in ACUs"
}
