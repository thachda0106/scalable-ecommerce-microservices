aws_region  = "us-east-1"
environment = "staging"

# Replace with your actual staging domain
domain_name = "staging.example.com"

alarm_email_endpoints = [
  "devops@example.com"
]

# redis_auth_token is sensitive — do NOT set here.
# Export before running terraform commands:
#
#   export TF_VAR_redis_auth_token="your-strong-random-token-min-16-chars"
