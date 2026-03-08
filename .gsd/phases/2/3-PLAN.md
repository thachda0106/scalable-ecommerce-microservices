---
phase: 2
plan: 3
wave: 3
---

# Plan 2.3: App Compute and Microservice Base Scaffold

## Objective
Complete the Terraform Phase 2 requirements by building the App delivery infrastructure (ECS clusters, ALBs) and creating the base blueprint for NestJS microservices. Finalize by wiring the modules up in the `dev` environment.

## Context
- .gsd/ARCHITECTURE.md
- c:\source\terraform

## Tasks

<task type="auto">
  <name>Create Compute Core Modules</name>
  <files>c:\source\terraform\modules\ecs_cluster, c:\source\terraform\modules\alb</files>
  <action>
    - Create `terraform/modules/ecs_cluster` defining the ECS Fargate cluster.
    - Create `terraform/modules/alb` generating the main Application Load Balancer facing the Internet (taking `public_subnets` and `vpc_id`). Expose the `alb_arn` and `alb_listener_arn` necessary for routing.
  </action>
  <verify>Test-Path c:\source\terraform\modules\ecs_cluster\main.tf</verify>
  <done>ECS Cluster and Core ALB modules ready</done>
</task>

<task type="auto">
  <name>Create microservice_base module</name>
  <files>c:\source\terraform\modules\microservice_base</files>
  <action>
    - This is the secret sauce module that provisions everything needed for *one* of the 10 services.
    - Create `terraform/modules/microservice_base/main.tf` specifying an `aws_ecs_service`, `aws_ecs_task_definition` (using Fargate), CloudWatch Logs setup, IAM roles for execution, and a Target Group attachment to an external ALB listener context.
    - Include variables like `service_name`, `container_image`, and `environment_vars`.
  </action>
  <verify>Test-Path c:\source\terraform\modules\microservice_base\main.tf</verify>
  <done>The microservice footprint template is ready</done>
</task>

<task type="auto">
  <name>Wire Dev Environment Template</name>
  <files>c:\source\terraform\environments\dev\main.tf</files>
  <action>
    - In `environments/dev/main.tf`, add the module call blocks (`module "vpc"`, `module "ecs"`, `module "alb"`, etc.) combining everything built across Waves 1-3.
    - The `microservice_base` and databases don't *all* need to be heavily invoked right now (cost parameters), but instantiate at least the core shared layers (`vpc`, `ecs_cluster`, `alb`) and leave placeholders for the others so the IaC skeleton is physically complete.
  </action>
  <verify>Get-Content c:\source\terraform\environments\dev\main.tf | Select-String "module `"vpc`""</verify>
  <done>The environments configuration binds the modules together successfully</done>
</task>

## Success Criteria
- [ ] ECS + ALB container orchestrator modules are written.
- [ ] `microservice_base` blueprint module exists for the developer iteration loops.
- [ ] Base modules are officially woven into a unified state representation under `environments/dev/main.tf`.
