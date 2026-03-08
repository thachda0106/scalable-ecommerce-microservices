output "bootstrap_brokers" {
  description = "A comma separated list of one or more hostname:port pairs of kafka brokers suitable to bootstrap connectivity to the kafka cluster"
  value       = aws_msk_cluster.main.bootstrap_brokers
}

output "bootstrap_brokers_tls" {
  description = "A comma separated list of one or more DNS names (or IPs) and TLS port pairs"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
}

output "bootstrap_brokers_sasl_scram" {
  description = "A comma separated list of one or more DNS names (or IPs) and SASL SCRAM port pairs"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_scram
}

output "zookeeper_connect_string" {
  description = "A comma separated list of one or more hostname:port pairs to connect to the Apache Zookeeper cluster"
  value       = aws_msk_cluster.main.zookeeper_connect_string
}
