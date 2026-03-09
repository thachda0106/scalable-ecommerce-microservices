terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region to deploy bootstrap resources"
}

variable "project_name" {
  type        = string
  default     = "ecommerce-platform"
  description = "Project name used to name bootstrap resources"
}

variable "environment" {
  type        = string
  default     = "shared"
  description = "Environment label for tagging"
}

# ---------------------------------------------------------------------------
# Remote State S3 Bucket
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "terraform_state" {
  bucket        = "${var.project_name}-terraform-state-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = {
    Name      = "Terraform State"
    ManagedBy = "terraform-bootstrap"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "expire-old-noncurrent-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ---------------------------------------------------------------------------
# DynamoDB State Locking Table
# ---------------------------------------------------------------------------

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "${var.project_name}-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name      = "Terraform State Locks"
    ManagedBy = "terraform-bootstrap"
  }
}

# ---------------------------------------------------------------------------
# Data sources
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "state_bucket_name" {
  description = "S3 bucket name to use in backend configuration"
  value       = aws_s3_bucket.terraform_state.bucket
}

output "dynamodb_table_name" {
  description = "DynamoDB table name to use in backend configuration"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "aws_account_id" {
  description = "AWS account ID where bootstrap resources are deployed"
  value       = data.aws_caller_identity.current.account_id
}
