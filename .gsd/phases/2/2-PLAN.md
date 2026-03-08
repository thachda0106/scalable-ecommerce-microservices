---
phase: 2
plan: 2
wave: 2
---

# Plan 2.2: Data Stores, Streaming, and Search Clusters

## Objective
Set up the managed data and streaming infrastructure modules. This fulfills the `rds`, `elasticache`, `msk`, and `opensearch` module requirements mapped out in `.gsd/ARCHITECTURE.md`.

## Context
- .gsd/ARCHITECTURE.md
- c:\source\terraform\modules\vpc\outputs.tf

## Tasks

<task type="auto">
  <name>Provision Database Modules</name>
  <files>c:\source\terraform\modules\rds, c:\source\terraform\modules\elasticache</files>
  <action>
    - Create definitions for `terraform/modules/rds` (Amazon Aurora PostgreSQL Serverless v2 compatible parameters).
    - Create definitions for `terraform/modules/elasticache` using cluster-mode enabled Redis.
    - Both should accept `vpc_id` and `private_subnets` as inputs via `variables.tf` and rely on Security Group variables.
  </action>
  <verify>Test-Path c:\source\terraform\modules\rds\main.tf</verify>
  <done>RDS and ElastiCache Modules are templated</done>
</task>

<task type="auto">
  <name>Provision Event & Search Modules</name>
  <files>c:\source\terraform\modules\msk, c:\source\terraform\modules\opensearch</files>
  <action>
    - Set up definitions for `terraform/modules/msk` to deploy an Apache Kafka cluster with typical production-ready configs (broker sizing, subnets).
    - Set up `terraform/modules/opensearch` taking VPC subnets to host the Search infrastructure.
    - Export necessary endpoint URIs in `outputs.tf` for both services.
  </action>
  <verify>Test-Path c:\source\terraform\modules\msk\main.tf</verify>
  <done>MSK and OpenSearch modules are authored</done>
</task>

## Success Criteria
- [ ] RDS Postgres serverless module created.
- [ ] ElastiCache Redis clustered module created.
- [ ] MSK highly available Kafka module created.
- [ ] OpenSearch module authored.
