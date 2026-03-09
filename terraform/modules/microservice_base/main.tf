resource "aws_cloudwatch_log_group" "main" {
  name              = "/ecs/${var.environment}/${var.service_name}"
  retention_in_days = var.log_retention_days

  tags = { Name = "${var.environment}-${var.service_name}-logs" }
}

# ---------------------------------------------------------------------------
# ECS Task Security Group
# Allows inbound only from the ALB security group on the container port.
# ---------------------------------------------------------------------------

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.environment}-${var.service_name}-sg"
  description = "ECS tasks SG for ${var.service_name}"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.environment}-${var.service_name}-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "from_alb" {
  security_group_id            = aws_security_group.ecs_tasks.id
  referenced_security_group_id = var.alb_security_group_id
  from_port                    = var.container_port
  to_port                      = var.container_port
  ip_protocol                  = "tcp"
  description                  = "Traffic from ALB only"
}

resource "aws_vpc_security_group_egress_rule" "ecs_egress" {
  security_group_id = aws_security_group.ecs_tasks.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---------------------------------------------------------------------------
# ECS Task Definition
# Secrets from Secrets Manager are injected as environment variables at
# container start by the ECS agent — they never appear in task definition JSON.
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "main" {
  family                   = "${var.environment}-${var.service_name}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = var.service_name
      image     = var.container_image
      essential = true

      portMappings = [{
        containerPort = var.container_port
        hostPort      = var.container_port
        protocol      = "tcp"
      }]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.main.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      environment = var.environment_vars
      secrets     = var.secret_vars
    }
  ])
}

# ---------------------------------------------------------------------------
# Target Group
# ---------------------------------------------------------------------------

resource "aws_lb_target_group" "main" {
  name        = "${var.environment}-${var.service_name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    healthy_threshold   = 3
    interval            = 30
    protocol            = "HTTP"
    matcher             = "200"
    timeout             = 5
    path                = var.health_check_path
    unhealthy_threshold = 2
  }
}

# ---------------------------------------------------------------------------
# ALB Listener Rule
# ---------------------------------------------------------------------------

resource "aws_lb_listener_rule" "main" {
  listener_arn = var.listener_arn
  priority     = var.listener_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }

  condition {
    path_pattern {
      values = [var.path_pattern]
    }
  }
}

# ---------------------------------------------------------------------------
# ECS Service
# Rolling deploy: keep 100% healthy during rollout, allow 200% for blue/green.
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "main" {
  name            = "${var.environment}-${var.service_name}"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = var.private_subnets
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = var.service_name
    container_port   = var.container_port
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  depends_on = [aws_lb_listener_rule.main]
}

# ---------------------------------------------------------------------------
# Application Auto Scaling
# Scale on both CPU and memory; whichever breaches its target first wins.
# ---------------------------------------------------------------------------

resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_tasks
  min_capacity       = var.min_tasks
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.environment}-${var.service_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.cpu_target_utilization
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "memory" {
  name               = "${var.environment}-${var.service_name}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = var.memory_target_utilization
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.environment}-${var.service_name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS service ${var.service_name} CPU > 85%"
  alarm_actions       = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
  ok_actions          = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = aws_ecs_service.main.name
  }
}

resource "aws_cloudwatch_metric_alarm" "memory_high" {
  alarm_name          = "${var.environment}-${var.service_name}-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS service ${var.service_name} Memory > 85%"
  alarm_actions       = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
  ok_actions          = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = aws_ecs_service.main.name
  }
}
