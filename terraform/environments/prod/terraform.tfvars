aws_region  = "us-east-1"
environment = "prod"

# Replace with your production API domain
domain_name = "api.example.com"

alarm_email_endpoints = [
  "devops@example.com",
  "oncall@example.com"
]

# redis_auth_token is sensitive — do NOT set here.
# Export before running terraform commands:
#
#   export TF_VAR_redis_auth_token="your-strong-random-token-min-16-chars"
#
# In CI/CD pipelines inject via secrets manager or a vault integration, e.g.:
#   export TF_VAR_redis_auth_token="$(aws secretsmanager get-secret-value \
#     --secret-id prod/redis/session/auth-token --query SecretString --output text)"
