# Notification Service

> Production-grade, multi-channel notification platform built with NestJS, DDD, CQRS, and event-driven microservices patterns.

---

## Table of Contents

- [Service Overview](#service-overview)
- [Responsibilities](#responsibilities)
- [Architecture Overview](#architecture-overview)
- [Folder Structure](#folder-structure)
- [Event Flow](#event-flow)
- [Notification Processing Flow](#notification-processing-flow)
- [Setup Instructions](#setup-instructions)
- [Local Development](#local-development)
- [Running the Service](#running-the-service)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Observability](#observability)
- [API Reference](#api-reference)

---

## Service Overview

The **notification-service** is responsible for receiving domain events from other microservices (via Kafka), rendering templates, and delivering notifications to users across multiple channels (Email, SMS, Push, In-App). It is designed following **Domain-Driven Design (DDD)**, **Clean Architecture**, and the **CQRS** pattern.

### Key Features

- **Multi-channel delivery** — Email (SendGrid), SMS (Twilio), Push (Firebase), In-App
- **Event-driven** — Consumes Kafka events from `user.events`, `order.events`, `cart.events`
- **Template engine** — Variable-based (`{{userName}}`, `{{orderId}}`) templates with validation
- **Retry with exponential backoff** — Automatic retries with `2^attempt * 1000ms` delay
- **Dead Letter Queue (DLQ)** — Failed notifications are routed to `notification.dlq` Kafka topic
- **Prometheus metrics** — Counters for sent, failed, retry, and DLQ notifications at `/metrics`
- **CQRS** — Commands for sending/retrying/DLQ, Queries for status lookup

---

## Responsibilities

| Responsibility | Description |
|---|---|
| Receive domain events | Consume Kafka events from user, order, and cart services |
| Render templates | Interpolate variables into notification templates |
| Deliver notifications | Route to the correct channel provider (Email, SMS, Push, In-App) |
| Handle failures | Mark failed, schedule retries with exponential backoff |
| DLQ routing | Move exhausted notifications to a Dead Letter Queue topic |
| Expose metrics | Prometheus counters for observability |
| REST API | Health check, manual send, status lookup, manual resend |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Notification Service                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │  Interfaces  │    │  Application │    │    Domain      │   │
│  │              │    │              │    │               │   │
│  │ • REST API   │───▶│ • Commands   │───▶│ • Notification│   │
│  │ • Kafka      │    │ • Handlers   │    │ • Template    │   │
│  │   Consumer   │    │ • Queries    │    │ • Enums       │   │
│  │ • DTOs       │    │ • Services   │    │ • Ports       │   │
│  └──────────────┘    └──────────────┘    └───────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                    Infrastructure                        │ │
│  │  • Kafka Consumers/Publisher    • Channel Providers      │ │
│  │  • Repositories (In-Memory)    • Retry Scheduler         │ │
│  │  • DLQ Processor               • Prometheus Metrics      │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

The service follows **Clean Architecture** with strict dependency inversion:

- **Domain** — Pure business logic with no framework imports
- **Application** — CQRS command/query handlers that orchestrate domain operations
- **Infrastructure** — Concrete implementations: Kafka, providers, repositories, metrics
- **Interfaces** — HTTP controllers, Kafka event handlers, DTOs

---

## Folder Structure

```
src/
├── main.ts                         # Bootstrap entry point
├── app.module.ts                   # Root module
├── notification.module.ts          # Core module with all DI wiring
│
├── domain/                         # Pure domain layer (no framework deps)
│   ├── entities/
│   │   ├── notification.ts         # Notification aggregate root
│   │   └── notification-template.ts # Template entity with rendering
│   ├── enums/
│   │   ├── notification-channel.enum.ts   # EMAIL, SMS, PUSH, IN_APP
│   │   ├── notification-status.enum.ts    # PENDING → SENT / RETRYING → FAILED → DLQ
│   │   └── notification-priority.enum.ts  # LOW, NORMAL, HIGH, CRITICAL
│   ├── errors/                     # Domain-specific errors
│   ├── events/                     # Domain events (Sent, Failed, RetryScheduled)
│   └── ports/                      # Port interfaces (Repository, Provider, Publisher)
│
├── application/                    # Use cases and orchestration
│   ├── commands/                   # SendNotification, RetryNotification, MoveToDlq
│   ├── queries/                    # GetNotification
│   ├── handlers/                   # CQRS command/query handlers
│   └── services/                   # NotificationOrchestrator
│
├── infrastructure/                 # External integrations
│   ├── kafka/                      # Kafka consumers and config
│   ├── providers/                  # Channel providers (SendGrid, Twilio, Firebase, InApp)
│   ├── repositories/               # In-memory notification & template repos
│   ├── services/                   # RetryScheduler, DlqProcessor, KafkaEventPublisher
│   └── metrics/                    # Prometheus metrics service
│
└── interfaces/                     # Entrypoints
    ├── controllers/                # REST NotificationController
    ├── messaging/                  # Kafka NotificationEventController
    └── dto/                        # Request DTOs with class-validator
```

---

## Event Flow

```
                           Kafka Topics
                    ┌─────────────────────┐
  user-service ────▶│   user.events       │
  order-service ───▶│   order.events      │──▶  NotificationEventController
  cart-service ────▶│   cart.events       │      │
                    └─────────────────────┘      │
                                                 ▼
                                          CommandBus.execute()
                                                 │
                                                 ▼
                                       SendNotificationHandler
                                          │         │
                                    success│         │failure
                                          ▼         ▼
                                       markSent()  markFailed()
                                          │         │
                                          ▼         ▼
                                    notification   retry scheduled
                                      .events         │
                                          │         ▼
                                          ▼    RetryScheduler
                                    KafkaEvent      (polls)
                                    Publisher          │
                                                      ▼
                                                DlqProcessor
                                                 (if exhausted)
                                                      │
                                                      ▼
                                              notification.dlq
                                               (Kafka topic)
```

### Consumed Events

| Event | Source | Template | Priority |
|---|---|---|---|
| `user.registered` | user-service | `user-registration` | HIGH |
| `order.created` | order-service | `order-confirmation` | HIGH |
| `order.paid` | order-service | `payment-receipt` | NORMAL |
| `order.shipped` | order-service | `shipping-update` | NORMAL |
| `cart.abandoned` | cart-service | `abandoned-cart` | LOW |

---

## Notification Processing Flow

1. **Event received** — Kafka event consumed by `NotificationEventController`
2. **Command dispatched** — `SendNotificationCommand` sent to `CommandBus`
3. **Template resolved** — `SendNotificationHandler` looks up template by slug
4. **Content rendered** — Template variables are interpolated (`{{userName}}` → `"John"`)
5. **Notification created** — `Notification` aggregate created with `PENDING` status
6. **Channel provider selected** — `ChannelProviderFactory.getProvider(channel)`
7. **Delivery attempted** — Provider's `send()` method is called
8. **Result handled**:
   - ✅ Success → `markSent()` → status becomes `SENT`
   - ❌ Failure → `markFailed()` → if retries remain: `RETRYING` with backoff, else: `FAILED`
9. **Persisted** — Notification saved to repository
10. **Domain events published** — `NotificationSentEvent` or `NotificationFailedEvent` published to Kafka

---

## Setup Instructions

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 8
- Docker (for Kafka, Redis)

### Install Dependencies

```bash
# From monorepo root
pnpm install
```

### Configure Environment

```bash
cd apps/notification-service
cp .env.example .env
# Edit .env with your configuration
```

---

## Local Development

```bash
# Start infrastructure (Kafka, Redis, etc.)
docker compose up -d

# Start in watch mode
pnpm start:dev
```

The service starts on `http://localhost:3000` by default.

---

## Running the Service

```bash
# Development
pnpm start:dev

# Production build
pnpm build
pnpm start:prod

# Debug mode
pnpm start:debug
```

---

## Environment Variables

See [`.env.example`](.env.example) for the complete list with descriptions.

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `KAFKA_CLIENT_ID` | Kafka client identifier | `notification-service` |
| `KAFKA_BROKERS` | Comma-separated broker list | `localhost:29092` |
| `KAFKA_TOPIC_USER_EVENTS` | User domain events topic | `user.events` |
| `KAFKA_TOPIC_ORDER_EVENTS` | Order domain events topic | `order.events` |
| `KAFKA_TOPIC_CART_EVENTS` | Cart domain events topic | `cart.events` |
| `KAFKA_DLQ_TOPIC` | Dead Letter Queue topic | `notification.dlq` |
| `RETRY_INTERVAL_MS` | Retry scheduler polling interval (ms) | `10000` |
| `DLQ_INTERVAL_MS` | DLQ processor polling interval (ms) | `30000` |

---

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:cov

# TypeScript type-check
npx tsc --noEmit
```

### Test Suites

| Suite | Location | Tests |
|---|---|---|
| Notification entity | `domain/entities/__tests__/notification.spec.ts` | Domain logic, backoff |
| Template entity | `domain/entities/__tests__/notification-template.spec.ts` | Rendering, variables |
| SendNotification handler | `application/handlers/__tests__/send-notification.handler.spec.ts` | CQRS flow |
| RetryNotification handler | `application/handlers/__tests__/retry-notification.handler.spec.ts` | Retry logic |
| ChannelProvider factory | `infrastructure/providers/__tests__/channel-provider.factory.spec.ts` | Provider routing |
| App controller | `app.controller.spec.ts` | Health check |

**Total: 6 suites, 36 tests**

---

## Observability

### Prometheus Metrics

Exposed at `GET /metrics` (Prometheus text format).

| Metric | Type | Labels | Description |
|---|---|---|---|
| `notification_sent_total` | Counter | `channel` | Total notifications sent successfully |
| `notification_failed_total` | Counter | `channel` | Total notifications failed to send |
| `notification_retry_total` | Counter | — | Total notification retries attempted |
| `notification_dlq_total` | Counter | — | Total notifications moved to DLQ |

### Structured Logging

Uses `@ecommerce/core` Logger with structured JSON output. Key log contexts:

- `SendNotificationHandler` — Delivery success/failure
- `RetrySchedulerService` — Retry processing
- `DlqProcessorService` — DLQ processing
- `KafkaEventPublisher` — Event publishing

---

## API Reference

### `POST /notifications`

Send a notification manually.

```json
{
  "recipientId": "user-123",
  "channel": "EMAIL",
  "templateSlug": "order-confirmation",
  "variables": { "orderId": "ORD-456" },
  "priority": "HIGH",
  "recipientEmail": "user@example.com"
}
```

### `GET /notifications/health`

Health check endpoint.

### `GET /notifications/:id`

Get notification status by ID.

### `POST /notifications/:id/resend`

Manually resend a notification.

### `GET /metrics`

Prometheus metrics endpoint (text format).
