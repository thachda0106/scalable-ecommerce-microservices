variable "environment" {
  type        = string
  description = "Environment name"
}

variable "alarm_email_endpoints" {
  type        = list(string)
  default     = []
  description = "List of email addresses to subscribe to the infrastructure alarms SNS topic"
}

variable "alb_arn_suffix" {
  type        = string
  description = "ALB ARN suffix used in CloudWatch metric dimensions (aws_lb.main.arn_suffix)"
}

variable "alb_5xx_threshold" {
  type        = number
  default     = 10
  description = "ALB 5xx error count threshold per minute before alarming"
}

variable "alb_4xx_threshold" {
  type        = number
  default     = 100
  description = "ALB 4xx error count threshold per minute before alarming"
}

variable "alb_latency_threshold_seconds" {
  type        = number
  default     = 2
  description = "ALB p99 response time in seconds before alarming"
}

variable "rds_cluster_ids" {
  type        = map(string)
  default     = {}
  description = "Map of friendly name to RDS cluster identifier for CPU alarms (e.g. { orders = 'dev-orders-cluster' })"
}

variable "msk_cluster_names" {
  type        = map(string)
  default     = {}
  description = "Map of friendly name to MSK cluster name for under-replicated partition alarms"
}
