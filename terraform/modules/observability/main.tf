# ---------------------------------------------------------------------------
# SNS Topic — central alert bus for all infrastructure alarms
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alarms" {
  name = "${var.environment}-infrastructure-alarms"

  tags = { Name = "${var.environment}-alarms" }
}

resource "aws_sns_topic_subscription" "email" {
  count = length(var.alarm_email_endpoints)

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email_endpoints[count.index]
}

# ---------------------------------------------------------------------------
# ALB Alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.environment}-alb-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = var.alb_5xx_threshold
  alarm_description   = "ALB 5xx error count > ${var.alb_5xx_threshold} — indicates backend failures"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_4xx" {
  alarm_name          = "${var.environment}-alb-4xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "HTTPCode_ELB_4XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = var.alb_4xx_threshold
  alarm_description   = "ALB 4xx error count > ${var.alb_4xx_threshold} — may indicate client issues or bad deploys"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_response_time" {
  alarm_name          = "${var.environment}-alb-high-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  extended_statistic  = "p99"
  threshold           = var.alb_latency_threshold_seconds
  alarm_description   = "ALB p99 latency > ${var.alb_latency_threshold_seconds}s"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }
}

# ---------------------------------------------------------------------------
# RDS Alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  for_each = var.rds_cluster_ids

  alarm_name          = "${var.environment}-rds-${each.key}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS cluster ${each.key} CPU > 80%"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBClusterIdentifier = each.value
  }
}

# ---------------------------------------------------------------------------
# MSK Alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "msk_under_replicated" {
  for_each = var.msk_cluster_names

  alarm_name          = "${var.environment}-msk-${each.key}-under-replicated"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "UnderReplicatedPartitions"
  namespace           = "AWS/Kafka"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "MSK cluster ${each.key} has under-replicated partitions — data durability at risk"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    "Cluster Name" = each.value
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Dashboard
# Provides a single-pane overview of the environment.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.environment}-infrastructure-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 1
        properties = {
          markdown = "## ${var.environment} Infrastructure Overview"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 1
        width  = 8
        height = 6
        properties = {
          title  = "ALB Request Count"
          view   = "timeSeries"
          period = 60
          stat   = "Sum"
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix]
          ]
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 1
        width  = 8
        height = 6
        properties = {
          title  = "ALB 5xx Errors"
          view   = "timeSeries"
          period = 60
          stat   = "Sum"
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", var.alb_arn_suffix, { color = "#d62728" }]
          ]
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 1
        width  = 8
        height = 6
        properties = {
          title  = "ALB Target Response Time (p99)"
          view   = "timeSeries"
          period = 60
          stat   = "p99"
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix]
          ]
        }
      }
    ]
  })
}
