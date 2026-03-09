variable "environment" {
  type        = string
  description = "Environment name"
}

variable "identifier" {
  type        = string
  description = "Unique identifier for this Redis cluster (e.g. session, cart)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the cluster will be deployed"
}

variable "private_subnets" {
  type        = list(string)
  description = "List of private subnet IDs — one per AZ"
}

variable "ecs_security_group_id" {
  type        = string
  description = "Security group ID of ECS tasks — the only source allowed to connect to Redis"
}

variable "auth_token" {
  type        = string
  sensitive   = true
  description = "Redis AUTH token — minimum 16 characters, required when transit encryption is enabled"
}

variable "node_type" {
  type        = string
  default     = "cache.t4g.micro"
  description = "ElastiCache node type"
}

variable "num_node_groups" {
  type        = number
  default     = 2
  description = "Number of node groups (shards) — determines horizontal capacity"
}

variable "replicas_per_node_group" {
  type        = number
  default     = 1
  description = "Number of read replicas per shard — set to ≥1 for multi-AZ failover"
}
