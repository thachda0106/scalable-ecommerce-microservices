aws_region  = "us-east-1"
environment = "dev"

# Replace with your actual dev domain — must be a domain you control for ACM DNS validation
domain_name = "dev.example.com"

alarm_email_endpoints = [
  "devops@example.com"
]

# redis_auth_token is sensitive — do NOT set here.
# Export before running terraform commands:
#
#   export TF_VAR_redis_auth_token="your-strong-random-token-min-16-chars"
