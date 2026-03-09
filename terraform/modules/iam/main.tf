data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# ECS Task Execution Role
# Used by the ECS agent to pull images and write logs.
# Also grants access to Secrets Manager secrets for the environment.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "ecs_execution" {
  name = "${var.environment}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.environment}-ecs-execution-role" }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_policy" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow the execution role to read Secrets Manager secrets for this environment
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.environment}-ecs-execution-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "kms:Decrypt"
      ]
      Resource = [
        "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.environment}/*"
      ]
    }]
  })
}

# ---------------------------------------------------------------------------
# Generic ECS Task Role
# Attached to running containers. Individual services add their own inline
# policies when they need access to specific AWS resources.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task" {
  name = "${var.environment}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.environment}-ecs-task-role" }
}

# ---------------------------------------------------------------------------
# OpenSearch Access Role
# Used by the search-service ECS tasks. The OpenSearch domain access policy
# references this role ARN as the master user.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "opensearch_access" {
  name = "${var.environment}-opensearch-access-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.environment}-opensearch-access-role" }
}

resource "aws_iam_role_policy" "opensearch_access" {
  name = "${var.environment}-opensearch-access-policy"
  role = aws_iam_role.opensearch_access.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "es:ESHttpGet",
        "es:ESHttpPost",
        "es:ESHttpPut",
        "es:ESHttpDelete",
        "es:DescribeElasticsearchDomains",
        "es:ListDomainNames"
      ]
      Resource = "arn:aws:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/${var.environment}-*/*"
    }]
  })
}

# ---------------------------------------------------------------------------
# VPC Flow Logs Role
# Allows the VPC Flow Logs service to publish records to CloudWatch Logs.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "flow_logs" {
  name = "${var.environment}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.environment}-flow-logs-role" }
}

resource "aws_iam_role_policy" "flow_logs" {
  name = "${var.environment}-flow-logs-policy"
  role = aws_iam_role.flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Resource = "*"
    }]
  })
}
