variable "environment" {
  type        = string
  description = "Environment name"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the ALB will be deployed"
}

variable "public_subnets" {
  type        = list(string)
  description = "List of public subnet IDs for the ALB — must span at least two AZs"
}

variable "domain_name" {
  type        = string
  description = "Base domain name for the ACM certificate (e.g. dev.example.com). A wildcard SAN is added automatically."
}
