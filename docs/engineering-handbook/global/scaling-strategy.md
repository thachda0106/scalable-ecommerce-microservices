# Scaling Strategy

> **Purpose:** How each component scales to handle increased load.

---

## Scaling Principles

1. **Scale horizontally first** — add instances, not bigger instances
2. **Stateless services** — no in-memory state, session in Redis
3. **Database per service** — each scales independently
4. **Cache aggressively** — Redis for hot data, CDN for static
5. **Async over sync** — Kafka absorbs traffic spikes

## Per-Component Scaling

| Component | Scaling Method | Trigger | Min | Max |
|-----------|---------------|---------|-----|-----|
| ECS (API Gateway) | Horizontal (tasks) | CPU > 60% or ALB request count | 3 | 20 |
| ECS (Order Service) | Horizontal | CPU > 60% | 3 | 15 |
| ECS (Other services) | Horizontal | CPU > 60% | 2 | 10 |
| RDS (PostgreSQL) | Vertical + Read Replicas | CPU > 70%, connections > 80% | — | — |
| ElastiCache (Redis) | Cluster mode (shards) | Memory > 75%, evictions > 0 | 2 nodes | 6 nodes |
| MSK (Kafka) | Add brokers + partitions | Disk > 75%, throughput limit | 3 brokers | 12 brokers |
| OpenSearch | Horizontal (data nodes) | CPU > 70%, storage > 75% | 2 nodes | 6 nodes |
| CloudFront | Automatic (AWS managed) | — | — | — |

## Caching Strategy

| Layer | Cache | TTL | Invalidation |
|-------|-------|-----|-------------|
| CDN | CloudFront | 24h (images), 5m (API) | CloudFront invalidation |
| API Gateway | — (pass-through) | — | — |
| Service | Redis (query cache) | 60s (list), 5m (detail) | On event (ProductUpdated → delete key) |
| Database | PG buffer pool | Auto | Auto (LRU) |

Cache pattern: **Cache-Aside** (read: check cache → miss → query DB → set cache)

## Database Scaling Path

```
Stage 1 (MVP):       Single RDS instance (db.r6g.large)
Stage 2 (Growth):    + Read replica (for GET-heavy services: Product, User)
Stage 3 (Scale):     Connection pooling (PgBouncer for > 500 connections)
Stage 4 (High):      Vertical scaling (db.r6g.2xlarge) or partitioning
Stage 5 (Massive):   Table partitioning by tenant_id or date range
```

## Kafka Scaling

```
If consumer lag grows:
  1. Add more consumer instances (up to partition count)
  2. If all partitions assigned: increase partition count
  3. If broker throughput limited: add brokers + rebalance

Partition count: set at topic creation, hard to change later
  → Start with enough partitions (6-12 for high-traffic topics)
```
