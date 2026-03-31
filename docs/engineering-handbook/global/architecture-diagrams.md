# Architecture Diagrams

> **Purpose:** Visual reference for the system's structural and behavioral views.
> Print these, pin them to the wall, reference them in design reviews.

---

## 1. System Context Diagram

```
                          ┌─────────────────────┐
                          │     E-Commerce       │
                          │     Platform         │
                          │                      │
  ┌──────────┐            │  ┌──────────────┐   │            ┌──────────────┐
  │ Customer │◄──────────►│  │ API Gateway  │   │◄──────────►│   Stripe     │
  │ (Web/    │            │  │              │   │            │   (Payment)  │
  │  Mobile) │            │  └──────────────┘   │            └──────────────┘
  └──────────┘            │         │           │
                          │  ┌──────┴───────┐   │            ┌──────────────┐
  ┌──────────┐            │  │ 10 Micro-    │   │◄──────────►│   AWS SES    │
  │  Admin   │◄──────────►│  │ services     │   │            │   (Email)    │
  │  Portal  │            │  │              │   │            └──────────────┘
  └──────────┘            │  └──────────────┘   │
                          └─────────────────────┘
```

---

## 2. Network Architecture (VPC)

```
  ┌────────────────────────── VPC: 10.0.0.0/16 ──────────────────────────┐
  │                                                                       │
  │  ┌────────────── Public Subnets ──────────────┐                      │
  │  │  AZ-a: 10.0.1.0/24   AZ-b: 10.0.2.0/24   │  AZ-c: 10.0.3.0/24  │
  │  │  ┌─────────┐         ┌─────────┐          │  ┌─────────┐         │
  │  │  │   ALB   │         │   NAT   │          │  │   NAT   │         │
  │  │  │         │         │ Gateway │          │  │ Gateway │         │
  │  │  └────┬────┘         └────┬────┘          │  └────┬────┘         │
  │  └───────┼───────────────────┼───────────────┘───────┼──────────────│
  │          │                   │                       │              │
  │  ┌───────┼──── Private Subnets ──────────────────────┼────────────┐ │
  │  │  AZ-a:│10.0.11.0/24  AZ-b: 10.0.12.0/24  AZ-c:  │10.0.13.0   │ │
  │  │       ▼                                           ▼            │ │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │ │
  │  │  │ API GW   │  │ Product  │  │  Order   │  │ Payment  │      │ │
  │  │  │ Auth     │  │ Search   │  │ Inventory│  │ Notif.   │      │ │
  │  │  │ User     │  │ Cart     │  │          │  │          │      │ │
  │  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │ │
  │  └────────────────────────┬────────────────────────────────────┘ │
  │                           │                                       │
  │  ┌───────────────── Data Subnets ──────────────────────────────┐ │
  │  │  AZ-a: 10.0.21.0/24  AZ-b: 10.0.22.0/24  AZ-c: 10.0.23.0 │ │
  │  │                                                              │ │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │
  │  │  │ RDS      │  │ Redis    │  │ Kafka    │  │OpenSearch│   │ │
  │  │  │(5 DBs)   │  │(cluster) │  │(3 broker)│  │          │   │ │
  │  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │ │
  │  └──────────────────────────────────────────────────────────────┘ │
  └───────────────────────────────────────────────────────────────────┘
```

---

## 3. Security Group Architecture

```
  Internet
     │
     ▼
  ┌──────────────────────┐
  │  SG: ALB             │  Ingress: 443 from 0.0.0.0/0
  │                      │  Egress: All to ECS SG
  └──────────┬───────────┘
             │
  ┌──────────▼───────────┐
  │  SG: ECS Services    │  Ingress: 3000-3009 from ALB SG only
  │                      │  Egress: All to Data SGs + NAT
  └──┬───────┬───────┬───┘
     │       │       │
  ┌──▼───┐ ┌─▼────┐ ┌▼──────┐
  │SG:RDS│ │SG:   │ │SG:    │  Each: Ingress from ECS SG only
  │5432  │ │Redis │ │Kafka  │  No internet access
  │      │ │6379  │ │9092   │
  └──────┘ └──────┘ └───────┘
```

---

## 4. CI/CD Pipeline Architecture

```
  Developer         GitHub              GitHub Actions         AWS
     │                │                      │                  │
     │ git push       │                      │                  │
     │───────────────►│                      │                  │
     │                │ Trigger workflow      │                  │
     │                │─────────────────────►│                  │
     │                │                      │ Detect changes   │
     │                │                      │ Build matrix     │
     │                │                      │                  │
     │                │                      │ Per service:     │
     │                │                      │ ├─ pnpm install  │
     │                │                      │ ├─ lint          │
     │                │                      │ ├─ type check    │
     │                │                      │ ├─ unit test     │
     │                │                      │ ├─ docker build  │
     │                │                      │ └─ push to ECR ─►│ ECR
     │                │                      │                  │
     │                │                      │ Deploy staging ─►│ ECS (staging)
     │                │                      │ Wait stable      │
     │                │                      │                  │
     │                │  PR approval         │                  │
     │                │◄─────────────────────│                  │
     │  Review        │                      │                  │
     │◄───────────────│                      │                  │
     │  Approve       │                      │                  │
     │───────────────►│                      │                  │
     │                │                      │ Deploy prod ────►│ ECS (prod)
```

---

## 5. Data Flow Architecture

```
  ┌─────────────────────── WRITE PATH ───────────────────────┐
  │                                                           │
  │  Client → API Gateway → Service → [DB] + [Outbox]       │
  │                                       │                   │
  │                              Outbox Relay (5s)            │
  │                                       │                   │
  │                                    Kafka                  │
  │                                       │                   │
  └───────────────────────────────────────┼───────────────────┘
                                          │
  ┌─────────────────────── READ PATH ────┼───────────────────┐
  │                                       │                   │
  │  Consumer → [Inbox] → Business Logic │                   │
  │     │                                                     │
  │     ├── Search Service → [OpenSearch]                    │
  │     ├── Inventory Service → [PostgreSQL]                 │
  │     └── Notification Service → [SES/SNS]                │
  │                                                           │
  │  Client → API Gateway → Service → [Cache] → [DB/ES]     │
  │                                                           │
  └───────────────────────────────────────────────────────────┘
```

---

## 6. Observability Architecture

```
  Services (stdout)                    Monitoring Stack
  ┌──────────────┐                    ┌──────────────────────┐
  │ JSON logs    │──────────────────►│ CloudWatch Logs      │
  │ to stdout    │                    │ ├── Log Groups       │
  └──────────────┘                    │ ├── Insights Queries │
                                      │ └── Subscription     │
  ┌──────────────┐                    │     Filters → S3     │
  │ /metrics     │──────────────────►│                      │
  │ (Prometheus) │   scrape 15s      │ Prometheus → Grafana │
  └──────────────┘                    │ ├── Dashboards       │
                                      │ └── Alert Rules      │
  ┌──────────────┐                    │                      │
  │ OpenTelemetry│──────────────────►│ Jaeger / X-Ray       │
  │ traces       │   OTLP export     │ └── Trace viewer     │
  └──────────────┘                    │                      │
                                      │ PagerDuty / Slack    │
  ┌──────────────┐                    │ └── P1/P2 alerts     │
  │ Sentry SDK   │──────────────────►│                      │
  │ (5xx errors) │                    │ Sentry               │
  └──────────────┘                    │ └── Error grouping   │
                                      └──────────────────────┘
```
