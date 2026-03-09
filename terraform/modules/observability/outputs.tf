output "sns_topic_arn" {
  description = "ARN of the infrastructure alarms SNS topic — pass this to microservice_base as sns_alarm_arn"
  value       = aws_sns_topic.alarms.arn
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}
