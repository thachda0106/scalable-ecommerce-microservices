---
phase: 12
plan: 7
wave: 3
depends_on: [5]
files_modified:
  - apps/notification-service/docs/notification-service-architecture.md
  - apps/notification-service/docs/notification-service-events.md
  - apps/notification-service/docs/notification-service-flow.md
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Architecture doc explains DDD layered structure, domain model, and provider abstraction"
    - "Events doc maps all consumed events to notification types with payload schema"
    - "Flow doc traces end-to-end notification lifecycle including retry/DLQ"
    - "All docs include mermaid diagrams for visual clarity"
  artifacts:
    - "apps/notification-service/docs/notification-service-architecture.md exists"
    - "apps/notification-service/docs/notification-service-events.md exists"
    - "apps/notification-service/docs/notification-service-flow.md exists"
---

# Plan 12.7: Documentation — Architecture, Events & Flow Docs

<objective>
Generate three comprehensive documentation files that explain the notification-service architecture, consumed events, and notification flow including retry/DLQ patterns.

Purpose: These docs serve as the technical reference for the notification-service, explaining design decisions, event mappings, and operational flows.
Output: 3 markdown documentation files.
</objective>

<context>
Load for context:
- apps/notification-service/src/domain/entities/notification.ts  (Plan 12.1)
- apps/notification-service/src/domain/entities/notification-template.ts  (Plan 12.1)
- apps/notification-service/src/application/services/notification-orchestrator.service.ts  (Plan 12.2)
- apps/notification-service/src/infrastructure/kafka/consumers/order-events.consumer.ts  (Plan 12.3)
- apps/notification-service/docs/ (existing docs directory — if any)
</context>

<tasks>

<task type="auto">
  <name>Create notification-service-architecture.md</name>
  <files>
    apps/notification-service/docs/notification-service-architecture.md
  </files>
  <action>
    Create a comprehensive architecture document containing:

    1. **Overview** — what the notification-service does in the ecommerce platform
    2. **Layered Architecture** — diagram showing:
       ```
       ┌─────────────────────────────────┐
       │  Interfaces (Controllers, DTOs)  │
       ├─────────────────────────────────┤
       │  Application (Handlers, CQRS)    │
       ├─────────────────────────────────┤
       │  Domain (Entities, Ports, Events)│
       ├─────────────────────────────────┤
       │  Infrastructure (Kafka, Providers│
       │  Repositories, Metrics)          │
       └─────────────────────────────────┘
       ```
    3. **Domain Model** — Notification aggregate (lifecycle state machine with mermaid diagram), NotificationTemplate (variable interpolation)
    4. **Provider Abstraction** — IChannelProvider interface, ChannelProviderFactory, how to add new providers
    5. **Dependency Inversion** — Symbol-based DI wiring, how port interfaces decouple domain from infrastructure
    6. **Folder Structure** — complete directory tree with file purposes
    7. **Scalability Considerations**:
       - Kafka partitioning (partition by userId or channel for ordered delivery)
       - Consumer groups (separate group per topic for independent scaling)
       - Parallel processing (multiple consumer instances per topic)
       - Provider rate limiting (per-channel rate limiting to respect API limits)
       - Horizontal scaling (stateless service, state in Kafka + repository)

    Use mermaid diagrams for:
    - Layer dependency diagram (dependency rule: inner layers don't know outer)
    - Notification status state machine
    - Component diagram

    AVOID generic architecture explanations. Reference specific files and code patterns.
  </action>
  <verify>test -f apps/notification-service/docs/notification-service-architecture.md && echo "Architecture doc exists"</verify>
  <done>Architecture doc covers layered structure, domain model, provider abstraction, DI wiring, folder structure, and scalability. Contains mermaid diagrams for state machine and layer dependencies. References specific files.</done>
</task>

<task type="auto">
  <name>Create notification-service-events.md and notification-service-flow.md</name>
  <files>
    apps/notification-service/docs/notification-service-events.md
    apps/notification-service/docs/notification-service-flow.md
  </files>
  <action>
    **notification-service-events.md** — event mapping reference:

    1. **Consumed Events** — table mapping each event to its notification:

    | Kafka Topic | Event Type | Consumer | Template Slug | Channel | Priority |
    |-------------|------------|----------|---------------|---------|----------|
    | user.events | UserRegistered | UserEventsConsumer | welcome-email | EMAIL | NORMAL |
    | order.events | OrderCreated | OrderEventsConsumer | order-confirmation-email | EMAIL | NORMAL |
    | order.events | OrderPaid / OrderConfirmed | OrderEventsConsumer | payment-confirmation-email | EMAIL | HIGH |
    | order.events | OrderShipped | OrderEventsConsumer | shipping-notification | EMAIL | NORMAL |
    | cart.events | CartAbandoned | CartEventsConsumer | cart-abandoned | EMAIL | LOW |

    2. **Event Payload Schemas** — for each event type, document the expected payload fields
    3. **Adding New Events** — step-by-step guide (add consumer handler → add orchestrator method → add template → add seed)
    4. **Dead Letter Queue** — events that fail processing go to `notification.dlq` topic

    **notification-service-flow.md** — end-to-end flow documentation:

    1. **Happy Path Flow** with mermaid sequence diagram:
    ```mermaid
    sequenceDiagram
      participant K as Kafka
      participant C as Consumer
      participant O as Orchestrator
      participant CB as CommandBus
      participant H as Handler
      participant T as TemplateRepo
      participant P as Provider
      participant R as NotificationRepo
      K->>C: order.paid event
      C->>O: handleOrderPaid(payload)
      O->>CB: execute(SendNotificationCommand)
      CB->>H: SendNotificationHandler.execute()
      H->>T: findBySlug('payment-confirmation-email')
      T-->>H: template
      H->>H: template.render(variables)
      H->>P: provider.send(payload)
      P-->>H: { success: true }
      H->>H: notification.markSent()
      H->>R: save(notification)
    ```

    2. **Retry Flow** — what happens when delivery fails
    3. **DLQ Flow** — what happens after max retries
    4. **Metrics Flow** — what gets tracked and where

    Use mermaid sequence diagrams for all flows.
    AVOID copy-pasting code. Reference file paths instead.
  </action>
  <verify>test -f apps/notification-service/docs/notification-service-events.md && test -f apps/notification-service/docs/notification-service-flow.md && echo "All docs exist"</verify>
  <done>Events doc maps all 5 consumed events to templates with payload schemas and priority levels. Flow doc traces happy path, retry, and DLQ flows with mermaid sequence diagrams. Includes guide for adding new events.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] All 3 documentation files exist in apps/notification-service/docs/
- [ ] Architecture doc contains mermaid diagrams
- [ ] Events doc contains complete event-to-notification mapping table
- [ ] Flow doc contains sequence diagrams for happy path, retry, and DLQ
- [ ] No broken file references in docs
</verification>

<success_criteria>
- [ ] 3 documentation files created
- [ ] All docs contain mermaid diagrams for visual clarity
- [ ] Event mapping table is complete for all 5 event types
- [ ] Docs reference actual file paths from the codebase
</success_criteria>
