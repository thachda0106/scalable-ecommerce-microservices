variable "environment" {
  type        = string
  description = "Environment name — used in secret paths and tags"
}

variable "rds_databases" {
  type = map(object({
    password = string
  }))
  default     = {}
  sensitive   = true
  description = "Map of RDS database identifiers to their master passwords"
}

variable "redis_clusters" {
  type = map(object({
    auth_token = string
  }))
  default     = {}
  sensitive   = true
  description = "Map of Redis cluster identifiers to their AUTH tokens"
}
