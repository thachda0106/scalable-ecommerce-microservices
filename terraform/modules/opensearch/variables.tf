variable "environment" {
  type        = string
  description = "Environment name"
}

variable "identifier" {
  type        = string
  description = "Unique identifier for this OpenSearch domain (e.g. search)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the domain will be deployed"
}

variable "private_subnets" {
  type        = list(string)
  description = "List of private subnet IDs — must match instance_count / AZ count"
}

variable "aws_region" {
  type        = string
  description = "AWS region — used to construct resource ARNs in access policy"
}

variable "ecs_security_group_id" {
  type        = string
  description = "Security group ID of ECS tasks — the only source allowed to connect"
}

variable "opensearch_access_role_arn" {
  type        = string
  description = "IAM role ARN used as the OpenSearch master user and in the domain access policy"
}

variable "instance_type" {
  type        = string
  default     = "t3.small.search"
  description = "OpenSearch instance type"
}

variable "instance_count" {
  type        = number
  default     = 3
  description = "Number of data nodes — must be a multiple of the AZ count (3)"
}

variable "ebs_volume_size" {
  type        = number
  default     = 20
  description = "EBS volume size in GiB per node"
}
