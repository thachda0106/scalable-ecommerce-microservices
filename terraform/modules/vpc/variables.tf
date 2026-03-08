variable "vpc_cidr" {
  description = "The CIDR block for the VPC"
  type        = string
}

variable "environment" {
  description = "The environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "public_subnets_cidr" {
  description = "List of public subnet CIDR blocks"
  type        = list(string)
}

variable "private_subnets_cidr" {
  description = "List of private subnet CIDR blocks"
  type        = list(string)
}
