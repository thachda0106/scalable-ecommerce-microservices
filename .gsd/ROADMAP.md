# ROADMAP.md

> **Current Phase**: Phase 1
> **Milestone**: Architecture & Design Phase

## Phases

### Phase 1: Architecture & System Design
**Status**: ✅ Complete
**Objective**: Document the high-level system architecture, service boundaries, domain models, database schemas, Kafka event architecture, Saga flows, infrastructure design, observability, CI/CD, and failure recovery.

### Phase 2: Infrastructure as Code (Terraform)
**Status**: ✅ Complete
**Objective**: Write modular Terraform code to provision AWS VPC, ECS cluster, RDS instances, Redis, MSK (Kafka), OpenSearch, ALB, and baseline IAM/Monitoring.

### Phase 3: Foundation Services & API Gateway
**Status**: ✅ Complete
**Objective**: Scaffold the NestJS monorepo/polyrepo structure. Implement API Gateway, Auth Service, and User Service. Set up OpenTelemetry tracing, centralized logging, and Prometheus metrics across base services.

### Phase 4: Product Catalog & Search (CQRS)
**Status**: ✅ Complete
**Objective**: Implement Product Service and Search Service. Model the event-driven synchronization between Product (writers) and Search (readers via OpenSearch) using Kafka to handle 50M products.

### Phase 5: Transactional Core (Saga Pattern)
**Status**: ✅ Completed
**Objective**: Implement Cart, Order, Inventory, and Payment services. Orchestrate or choreograph the complex checkout Saga handling reservations, payments, and compensation logic to prevent over-selling and double charging.

### Phase 6: Notifications & CI/CD Finalization
**Status**: ✅ Completed
**Objective**: Implement Notification service for order updates. Finalize GitHub Actions/GitLab CI pipelines for automated testing, Docker build/push, and deployment to ECS.
