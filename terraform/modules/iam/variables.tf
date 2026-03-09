variable "environment" {
  type        = string
  description = "Environment name used to prefix all IAM resource names"
}

variable "aws_region" {
  type        = string
  description = "AWS region — used to scope IAM policy resource ARNs"
}
