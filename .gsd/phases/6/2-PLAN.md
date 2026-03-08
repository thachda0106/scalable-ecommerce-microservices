---
phase: 6
plan: 2
wave: 2
---

# Plan 6.2: Implement Notification Kafka Consumer

## Objective
Consume `OrderConfirmed` and `OrderFailed` events from the `order.events` Kafka topic to simulate sending emails and SMS notifications.

## Context
- .gsd/ARCHITECTURE.md
- apps/notification-service

## Tasks

<task type="auto">
  <name>Implement Notification Consumer</name>
  <files>c:\source\apps\notification-service\src\consumer\notification-consumer.service.ts, c:\source\apps\notification-service\src\app.module.ts</files>
  <action>
    - Install `kafkajs` and `@nestjs/microservices`.
    - Create `NotificationService` to mock sending emails.
    - Create `NotificationConsumerService` that listens to `order.events`.
    - Parse events and dispatch mock emails using standard logging when `OrderConfirmed` (e.g. "Receipt for Order X") or `OrderFailed` (e.g. "Order X Cancelled due to Payment Failure") are received.
  </action>
  <verify>Test-Path c:\source\apps\notification-service\src\consumer\notification-consumer.service.ts</verify>
  <done>Notification service correctly parses order events and logs mock emails</done>
</task>

## Success Criteria
- [ ] Notification service consumes Kafka events seamlessly.
- [ ] Mock email logs appear in terminal output.
