output "cluster_endpoint" {
  description = "Writer endpoint for the cluster"
  value       = aws_rds_cluster.main.endpoint
}

output "cluster_reader_endpoint" {
  description = "A read-only endpoint for the cluster"
  value       = aws_rds_cluster.main.reader_endpoint
}
