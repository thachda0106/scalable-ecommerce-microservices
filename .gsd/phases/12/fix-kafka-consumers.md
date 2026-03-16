---
phase: 12
plan: fix-kafka-consumers
wave: 1
gap_closure: true
---

# Fix Plan: Missing Kafka Consumers

## Problem
The service is missing Kafka consumers for the necessary domain events (`user.registered`, `order.created`, `order.paid`, `order.shipped`, `cart.abandoned`).

## Tasks

<task type="auto">
  <name>Implement Kafka Event Consumers</name>
  <files>apps/notification-service/src/interfaces/messaging/*.ts, apps/notification-service/src/notification.module.ts</files>
  <action>Create a Kafka consumer controller (e.g., `NotificationEventController`) using `@EventPattern` to consume the 5 specified topic events. Map these events into calls to `CommandBus` to trigger notifications (e.g., `SendEmailNotification`).</action>
  <verify>Verify consumers exist and are registered in the module. Run tests to confirm message handling.</verify>
  <done>Consumers implemented and correctly map to CQRS commands.</done>
</task>
