output "alb_arn" {
  description = "Full ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "alb_arn_suffix" {
  description = "ARN suffix used in CloudWatch metric dimensions"
  value       = aws_lb.main.arn_suffix
}

output "alb_dns_name" {
  description = "DNS name of the ALB — use this as the CNAME or alias target"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB — used for Route 53 alias records"
  value       = aws_lb.main.zone_id
}

output "https_listener_arn" {
  description = "ARN of the HTTPS (443) listener — used by microservice_base listener rules"
  value       = aws_lb_listener.https.arn
}

output "http_listener_arn" {
  description = "ARN of the HTTP (80) listener"
  value       = aws_lb_listener.http.arn
}

output "alb_security_group_id" {
  description = "Security group ID attached to the ALB — referenced as source in ECS task SGs"
  value       = aws_security_group.alb.id
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = aws_acm_certificate.main.arn
}

output "acm_certificate_domain_validation_options" {
  description = "DNS validation records that must be created in your DNS provider"
  value       = aws_acm_certificate.main.domain_validation_options
}
