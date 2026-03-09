variable "vpc_cidr" {
  type        = string
  description = "The CIDR block for the VPC"
}

variable "environment" {
  type        = string
  description = "The environment name (e.g., dev, staging, prod)"
}

variable "public_subnets_cidr" {
  type        = list(string)
  description = "List of public subnet CIDR blocks — one per AZ"
}

variable "private_subnets_cidr" {
  type        = list(string)
  description = "List of private subnet CIDR blocks — one per AZ"
}

variable "flow_logs_role_arn" {
  type        = string
  description = "IAM role ARN that allows VPC Flow Logs to publish to CloudWatch Logs"
}

variable "flow_logs_retention_days" {
  type        = number
  description = "Number of days to retain VPC Flow Log entries in CloudWatch"
  default     = 30
}
