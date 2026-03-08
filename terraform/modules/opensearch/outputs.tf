output "domain_endpoint" {
  description = "Domain-specific endpoint used to submit index, search, and data upload requests"
  value       = aws_opensearch_domain.main.endpoint
}

output "dashboard_endpoint" {
  description = "Domain-specific endpoint for OpenSearch Dashboards"
  value       = aws_opensearch_domain.main.dashboard_endpoint
}
