variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region to deploy all resources"
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "Environment name — propagated to all resource names and tags"
}

variable "vpc_cidr" {
  type        = string
  default     = "10.2.0.0/16"
  description = "Primary CIDR block for the VPC — must not overlap with other environments"
}

variable "public_subnets_cidr" {
  type    = list(string)
  default = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]
  description = "CIDR blocks for public subnets — one per AZ"
}

variable "private_subnets_cidr" {
  type    = list(string)
  default = ["10.2.4.0/24", "10.2.5.0/24", "10.2.6.0/24"]
  description = "CIDR blocks for private subnets — one per AZ"
}

variable "domain_name" {
  type        = string
  default     = "api.example.com"
  description = "Base domain name for the ACM certificate and HTTPS listener"
}

variable "redis_auth_token" {
  type        = string
  sensitive   = true
  description = "Redis AUTH token — minimum 16 characters. Set via TF_VAR_redis_auth_token env var."
}

variable "alarm_email_endpoints" {
  type        = list(string)
  default     = []
  description = "Email addresses to subscribe to CloudWatch alarm notifications"
}
