---
phase: 12
plan: fix-retry-dlq
wave: 1
gap_closure: true
---

# Fix Plan: Retry with Exponential Backoff and DLQ

## Problem
Currently, the retry mechanism polls indefinitely/fixed-rate and there is no Dead Letter Queue (DLQ) routing when maximum delivery attempts are exhausted.

## Tasks

<task type="auto">
  <name>Implement Exponential Backoff and DLQ</name>
  <files>apps/notification-service/src/domain/entities/notification.ts, apps/notification-service/src/application/handlers/retry-notification.handler.ts</files>
  <action>Update the domain logic to compute `nextRetryAt` using exponential backoff (e.g., 2^attempt). Update the `RetryNotificationHandler` or domain logic to route an event/message to a DLQ (e.g., via `KafkaProducer` or equivalent) when attempts reach the maximum threshold.</action>
  <verify>Check the domain tests for backoff calculation and handler tests for DLQ event emission.</verify>
  <done>Retry backoff correctly calculates. Failed notifications push to DLQ after max retries.</done>
</task>
