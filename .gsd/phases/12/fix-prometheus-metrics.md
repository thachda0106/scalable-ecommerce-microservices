---
phase: 12
plan: fix-prometheus-metrics
wave: 1
gap_closure: true
---

# Fix Plan: Prometheus Metrics

## Problem
The service lacks a `/metrics` endpoint using `prom-client`. It currently uses a placeholder in-memory metric service.

## Tasks

<task type="auto">
  <name>Implement Prometheus Integration</name>
  <files>apps/notification-service/src/infrastructure/metrics/*.ts, apps/notification-service/src/interfaces/http/metrics.controller.ts, apps/notification-service/src/notification.module.ts</files>
  <action>Install `@willsoto/nestjs-prometheus` and `prom-client` if they don't exist. Refactor `NotificationMetricsService` to use proper Prometheus counters (`notification_sent_total`, `notification_failed_total`, `notification_retry_total`). Create or expose a `/metrics` controller endpoint to export metrics.</action>
  <verify>Run the application and query `GET /metrics` to ensure Prometheus text format is returned.</verify>
  <done>Metrics exposed in Prometheus format at `/metrics`.</done>
</task>
