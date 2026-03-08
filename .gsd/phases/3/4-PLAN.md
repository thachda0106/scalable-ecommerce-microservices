---
phase: 3
plan: 4
wave: 4
---

# Plan 3.4: Local Docker Development Stack

## Objective
Provide a unified `docker-compose.yml` to spin up dependencies (PostgreSQL, Redis, Kafka + Zookeeper, OpenSearch) locally so we can run these NestJS microservices without provisioning costly Terraform AWS infrastructure right away.

## Context
- .gsd/ARCHITECTURE.md

## Tasks

<task type="auto">
  <name>Create Centralized Docker Compose</name>
  <files>c:\source\docker\docker-compose.yml, c:\source\docker\.env</files>
  <action>
    - Construct `c:\source\docker\docker-compose.yml` defining services:
      1. `postgres` (image `postgres:15-alpine`, ports `5432:5432`)
      2. `redis` (image `redis:7-alpine`, ports `6379:6379`)
      3. `zookeeper` and `kafka` (using `confluentinc/cp-kafka:latest` or bitnami, exposing `9092:9092`)
      4. `opensearch` (image `opensearchproject/opensearch:2.11.0`, exposing `9200:9200`)
    - Expose volumes for persistence (`volumes/pgdata`, `volumes/redisdata`, etc.).
    - Supply a generic local `.env` stub to define connection URLs (`DATABASE_URL`, `KAFKA_BROKERS`, etc.).
  </action>
  <verify>Test-Path c:\source\docker\docker-compose.yml</verify>
  <done>Local development dependencies are orchestrated correctly</done>
</task>

## Success Criteria
- [ ] Docker compose file orchestrates the local dev cluster successfully.
