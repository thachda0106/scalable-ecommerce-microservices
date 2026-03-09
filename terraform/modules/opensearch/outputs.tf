output "domain_endpoint" {
  description = "Domain-specific endpoint for index, search, and data upload requests"
  value       = aws_opensearch_domain.main.endpoint
}

output "dashboard_endpoint" {
  description = "Domain-specific endpoint for OpenSearch Dashboards"
  value       = aws_opensearch_domain.main.dashboard_endpoint
}

output "security_group_id" {
  description = "Security group ID attached to the OpenSearch domain"
  value       = aws_security_group.opensearch.id
}
