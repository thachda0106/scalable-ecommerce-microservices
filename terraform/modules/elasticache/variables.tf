variable "environment" {
  description = "The environment name"
  type        = string
}

variable "identifier" {
  description = "Unique identifier for this ElastiCache cluster"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the cluster will be deployed"
  type        = string
}

variable "private_subnets" {
  description = "List of private subnet IDs"
  type        = list(string)
}
