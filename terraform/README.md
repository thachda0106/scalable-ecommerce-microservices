# Terraform Infrastructure — Ecommerce Platform

Production-grade AWS infrastructure for the scalable ecommerce microservices platform. All resources are managed with Terraform, organized into reusable modules and per-environment root configurations.

---

## Architecture Overview

```
Internet
    |
[Route 53] --> [ACM Certificate]
    |
[Application Load Balancer]  (public subnets, HTTPS only, HTTP->HTTPS redirect)
    |
[ECS Fargate Tasks]          (private subnets, per-service security groups)
    |          |          |
[Aurora PG] [Redis]  [OpenSearch]  [MSK Kafka]
(Serverless) (Cluster) (Fine-grained AC)  (SASL/SCRAM, TLS)
```

### Core Design Decisions

- **Multi-AZ NAT Gateways** — one NAT GW per AZ so that an AZ failure does not take down all outbound connectivity from private subnets.
- **Security group source references** — data-layer security groups (RDS, Redis, MSK, OpenSearch) accept traffic only from the shared ECS security group ID, not from CIDR blocks. This prevents lateral movement even within the VPC.
- **No plaintext passwords** — RDS uses `manage_master_user_password = true` (AWS Secrets Manager managed). Redis AUTH token is a sensitive variable never committed to state or `.tfvars`.
- **HTTPS everywhere** — ALB HTTP listener performs a 301 redirect; TLS 1.3 preferred policy on the HTTPS listener. OpenSearch enforces HTTPS with TLS 1.2 minimum. MSK uses TLS-only client-broker transport.
- **Encryption at rest** — all persistent storage (S3, RDS, ElastiCache, OpenSearch, DynamoDB) is encrypted with AES-256 or AWS-managed KMS keys.
- **Auto scaling** — every ECS service has CPU and memory target-tracking policies. Aurora Serverless v2 scales ACUs automatically.
- **Observability from day one** — VPC Flow Logs, ALB access logs to S3, MSK/Redis/ECS logs to CloudWatch, SNS alarm topic, CloudWatch dashboard.

---

## Repository Structure

```
terraform/
├── bootstrap/                  # One-time setup: S3 state bucket + DynamoDB lock table
│   └── main.tf
├── modules/
│   ├── iam/                    # ECS execution, task, OpenSearch, and flow-logs roles
│   ├── vpc/                    # VPC, subnets, multi-AZ NAT GWs, flow logs
│   ├── alb/                    # ALB, ACM certificate, HTTPS listener, access logs S3
│   ├── ecs_cluster/            # ECS cluster, Container Insights, shared SG
│   ├── rds/                    # Aurora Serverless v2 per service domain
│   ├── elasticache/            # Redis cluster mode, encrypted, auth token
│   ├── msk/                    # MSK Kafka, TLS + SASL/SCRAM
│   ├── opensearch/             # OpenSearch domain, fine-grained AC, VPC
│   ├── microservice_base/      # ECS service + task def + ALB rule + auto scaling + alarms
│   ├── observability/          # SNS topic, ALB/RDS/MSK alarms, CloudWatch dashboard
│   └── secrets/                # Optional: Secrets Manager entries for external secrets
└── environments/
    ├── dev/
    │   ├── main.tf             # Root module wiring all modules together
    │   ├── variables.tf
    │   └── terraform.tfvars
    ├── staging/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── terraform.tfvars
    └── prod/
        ├── main.tf
        ├── variables.tf
        └── terraform.tfvars
```

---

## Prerequisites

- Terraform >= 1.5.0
- AWS CLI configured with appropriate credentials
- An AWS account and an IAM principal with sufficient permissions (PowerUser or equivalent)
- A domain name you control (for ACM DNS validation)

---

## Bootstrap — First Time Setup

The bootstrap step creates the S3 bucket and DynamoDB table that all environment backends reference. Run this once per AWS account.

```bash
cd terraform/bootstrap

terraform init
terraform apply

# Note the outputs:
# state_bucket_name  = "ecommerce-platform-terraform-state-<account-id>"
# dynamodb_table_name = "ecommerce-platform-terraform-locks"
```

If your account ID differs from the default in the backend blocks, update the `bucket` value in each `environments/*/main.tf` backend configuration before initialising.

---

## Deploying an Environment

### 1. Set sensitive variables

Redis AUTH token must never be committed to source control. Set it as an environment variable before every terraform session:

```bash
export TF_VAR_redis_auth_token="$(openssl rand -base64 32)"
# Store the token securely (e.g. in AWS Secrets Manager or 1Password) before proceeding.
```

### 2. Initialise

```bash
cd terraform/environments/dev   # or staging / prod

terraform init
```

### 3. Review the plan

```bash
terraform plan -out=tfplan
```

Read the output carefully before applying. For production, treat the plan as a required review artifact and store it as a CI/CD pipeline artefact.

### 4. Apply

```bash
terraform apply tfplan
```

### 5. Validate ACM certificate

After the first apply, the ACM certificate will be in `PENDING_VALIDATION` state. Retrieve the required DNS records from the Terraform output and add them to your DNS provider:

```bash
terraform output acm_validation_records
```

Create the CNAME records shown. Certificate validation typically completes within 5 minutes.

---

## Environment Comparison

| Setting                | dev          | staging        | prod            |
|------------------------|-------------|----------------|-----------------|
| VPC CIDR               | 10.0.0.0/16  | 10.1.0.0/16    | 10.2.0.0/16     |
| RDS max_capacity (ACU) | 2.0          | 4.0            | 8.0             |
| RDS backup_retention   | 3 days       | 7 days         | 30 days         |
| RDS deletion_protection| false        | false          | true            |
| skip_final_snapshot    | true         | true           | false           |
| MSK instance type      | t3.small     | m5.large       | m5.large        |
| Redis node type        | t4g.micro    | t4g.small      | r7g.large       |
| Redis node groups      | 2            | 2              | 3               |
| OpenSearch type        | t3.small     | m5.large       | m5.large        |
| Flow log retention     | 30 days      | 60 days        | 90 days         |
| ALB 5xx threshold      | 10           | 10             | 5               |

---

## Adding a New Microservice

Use the `microservice_base` module. Add a block to the relevant environment `main.tf`:

```hcl
module "payment_service" {
  source = "../../modules/microservice_base"

  # Required identity
  environment  = var.environment
  service_name = "payment-service"
  aws_region   = var.aws_region

  # Networking
  vpc_id          = module.vpc.vpc_id
  private_subnets = module.vpc.private_subnet_ids

  # ECS cluster wiring
  cluster_id   = module.ecs_cluster.cluster_id
  cluster_name = module.ecs_cluster.cluster_name

  # ALB wiring — pick a unique priority number
  alb_security_group_id = module.alb.alb_security_group_id
  listener_arn          = module.alb.https_listener_arn
  listener_priority     = 120
  path_pattern          = "/api/payments/*"

  # Container
  container_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/payment-service:latest"
  container_port  = 8080
  health_check_path = "/health"

  # Compute
  fargate_cpu    = 512
  fargate_memory = 1024

  # IAM
  execution_role_arn = module.iam.ecs_execution_role_arn
  task_role_arn      = module.iam.ecs_task_role_arn

  # Scaling
  desired_count  = 2
  min_tasks      = 2
  max_tasks      = 20

  # Alerting
  sns_alarm_arn = module.observability.sns_topic_arn

  # Non-sensitive config
  environment_vars = [
    { name = "ENVIRONMENT", value = var.environment },
    { name = "LOG_LEVEL",   value = "info" }
  ]

  # Secrets injected from Secrets Manager at container start
  secret_vars = [
    { name = "STRIPE_API_KEY", valueFrom = "arn:aws:secretsmanager:us-east-1:123456789012:secret:dev/payment-service/stripe-key" }
  ]
}
```

If the service needs to talk to an existing data-layer resource (e.g. its own RDS cluster), add that module call first and pass `ecs_security_group_id = module.ecs_cluster.cluster_security_group_id` to it.

---

## Updating a Container Image

ECS services use the task definition ARN to determine what to run. To deploy a new image:

**Option A — Terraform (recommended for infrastructure changes)**

Update the `container_image` variable or the image tag in the module call, then:

```bash
terraform plan -out=tfplan
terraform apply tfplan
```

Terraform will create a new task definition revision and trigger a rolling deployment.

**Option B — AWS CLI (faster for application-only deploys)**

```bash
# Register a new task definition revision with the updated image
TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition dev-payment-service \
  --query 'taskDefinition' --output json \
  | jq '.containerDefinitions[0].image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/payment-service:v1.2.3"')

NEW_REV=$(aws ecs register-task-definition \
  --cli-input-json "$TASK_DEF" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

# Update the service to use the new revision
aws ecs update-service \
  --cluster dev-ecs-cluster \
  --service dev-payment-service \
  --task-definition "$NEW_REV"
```

This does not update Terraform state. Re-align Terraform on the next planned infrastructure change by setting the tag in the module.

---

## Security Practices

### Credentials

- Never commit AWS credentials, secret tokens, or passwords to source control.
- Use IAM roles for all CI/CD pipelines. Avoid long-lived access keys.
- The `redis_auth_token` variable is marked `sensitive = true`. Always pass it via `TF_VAR_redis_auth_token` or a secrets vault integration.

### State Security

- The S3 state bucket has versioning, AES-256 SSE, and a public access block.
- The DynamoDB lock table has PITR enabled.
- Access to the state bucket should be restricted by an S3 bucket policy to your CI/CD role and operations team only.

### Least Privilege Network Access

- All data-layer security groups accept traffic exclusively from the `ecs_shared` security group ID. No CIDR-based ingress rules exist on RDS, Redis, MSK, or OpenSearch.
- ECS task security groups accept traffic only from the ALB security group on the specific container port.
- There is no public ingress to any data layer resource.

### Secrets Management

- RDS passwords are managed by AWS Secrets Manager via `manage_master_user_password = true` — the password never appears in Terraform state.
- Redis AUTH tokens are injected from `TF_VAR_*` environment variables and stored in Terraform state as sensitive values (encrypted in S3).
- Application secrets (API keys, tokens) should be stored in AWS Secrets Manager under `<environment>/<service-name>/<secret-name>` and referenced in `secret_vars` in the task definition. The ECS execution role has `secretsmanager:GetSecretValue` permission for `<environment>/*`.

### Encryption

- All S3 buckets use AES-256 server-side encryption with public access blocked.
- All RDS clusters have `storage_encrypted = true`.
- All Redis clusters have `at_rest_encryption_enabled = true` and `transit_encryption_enabled = true`.
- OpenSearch enforces HTTPS and has `encrypt_at_rest` and `node_to_node_encryption` enabled.
- MSK uses TLS-only client-broker transport and in-cluster encryption.

---

## Team Workflow

### Branching and Review

1. Create a feature branch: `git checkout -b infra/add-payment-service`
2. Make changes to the appropriate environment or module.
3. Run `terraform fmt -recursive` to normalise formatting.
4. Run `terraform validate` in the affected environment directory.
5. Open a pull request. Include the `terraform plan` output as a comment (sanitise any sensitive values).
6. Require at least one peer review before merging.
7. After merge, the CI/CD pipeline runs `terraform apply` automatically for dev. Staging and production require a manual approval gate.

### CI/CD Pipeline Skeleton

```yaml
# Example GitHub Actions structure (adapt to your CI system)
steps:
  - name: Setup Terraform
    uses: hashicorp/setup-terraform@v3
    with:
      terraform_version: "1.9.x"

  - name: Terraform Init
    run: terraform init
    working-directory: terraform/environments/dev

  - name: Terraform Plan
    run: terraform plan -out=tfplan -no-color
    working-directory: terraform/environments/dev
    env:
      TF_VAR_redis_auth_token: ${{ secrets.REDIS_AUTH_TOKEN_DEV }}

  - name: Terraform Apply
    if: github.ref == 'refs/heads/main'
    run: terraform apply tfplan
    working-directory: terraform/environments/dev
    env:
      TF_VAR_redis_auth_token: ${{ secrets.REDIS_AUTH_TOKEN_DEV }}
```

### Workspace Isolation

Each environment has its own backend state key:
- dev: `ecommerce-platform/dev/terraform.tfstate`
- staging: `ecommerce-platform/staging/terraform.tfstate`
- prod: `ecommerce-platform/prod/terraform.tfstate`

State files are fully isolated. A plan in one environment cannot affect another.

### Module Versioning

All environments pin the provider version to `~> 5.0`. When upgrading providers:
1. Update the version constraint in all three environment `main.tf` files simultaneously.
2. Run `terraform init -upgrade` in each environment.
3. Deploy dev first, validate, then promote to staging and prod.

---

## Useful Commands

```bash
# Format all HCL files recursively
terraform fmt -recursive terraform/

# Validate a specific environment
cd terraform/environments/dev && terraform validate

# View outputs after apply
terraform output

# Refresh state without making changes
terraform plan -refresh-only

# Target a specific resource for debugging
terraform plan -target=module.rds_orders

# Destroy an environment (dev/staging only — prod has deletion_protection)
terraform destroy

# List all resources in state
terraform state list

# Show details of a specific resource
terraform state show module.vpc.aws_vpc.main
```
