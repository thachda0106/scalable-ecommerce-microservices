# Phase 12 — Scaling Strategy

---

## 1. Overview

Define how each component scales from MVP traffic to 10x growth. Scaling strategy must be
planned before launch — reactive scaling during an incident causes more damage.

## 2. Goals

- Auto-scaling configured for all compute (ECS)
- Database scaling path defined (vertical → read replicas → partitioning)
- Caching strategy reduces DB load by 80%+
- Kafka partitioning allows consumer horizontal scaling

## 3. Architecture Design

See [Scaling Strategy](../global/scaling-strategy.md) for per-component scaling details.

## 4. Technology Choices

| Component | Scaling Mechanism |
|-----------|------------------|
| ECS | Horizontal auto-scaling (CPU/request count) |
| RDS | Vertical + read replicas + connection pooling |
| Redis | Cluster mode (add shards) |
| Kafka | Add brokers + partitions |
| OpenSearch | Add data nodes |
| CloudFront | Automatic (AWS-managed) |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-038 | Cache-aside (not write-through) | Simpler, cache miss → DB → set cache |
| ADR-039 | Start with vertical DB scaling | Cheaper than read replicas for early growth |
| ADR-040 | Over-partition Kafka at creation | Can't easily increase partitions later |

## 6. Data Flow / Request Flow

**Cache-aside pattern:**
```
Request → Check Redis → HIT → return cached
                      → MISS → query DB → set cache (TTL) → return
Event received → invalidate cache key → next read refreshes
```

## 7. Components Involved

All — scaling spans every layer.

## 8. Implementation Plan

| Step | When |
|------|------|
| Configure ECS auto-scaling policies | Pre-launch |
| Set up Redis caching on hot paths | Pre-launch |
| Monitor and right-size | Month 1-3 |
| Add RDS read replicas if needed | Month 3-6 |
| Review Kafka partition assignments | Month 3-6 |
| Table partitioning if data > 100M rows | Month 6-12 |

## 9. Tasks Checklist

```
- [ ] ECS auto-scaling policies (target tracking: CPU 60%)
- [ ] ECS min/max instances per service configured
- [ ] Redis caching on product lists, product details, user profiles
- [ ] Cache invalidation on data changes (event-driven)
- [ ] Connection pooling configured for RDS (pool size per service)
- [ ] Kafka partitions set at creation (12 for order, 6 for others)
- [ ] Consumer instances ≤ partition count
- [ ] CloudFront caching headers configured
- [ ] Load test validates auto-scaling triggers correctly
- [ ] Document scaling triggers and thresholds
- [ ] Cost projection for 2x, 5x, 10x traffic
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| Auto-scaling policies | Load test triggers scale-out |
| Cache hit ratio > 80% | Check cache_hit_ratio metric |
| Scaling documentation | Each component's scaling path documented |
| Cost projections | Spreadsheet for 2x/5x/10x scenarios |

## 11. Dependencies

- Phase 04 (auto-scaling terraform modules)
- Phase 09 (metrics to drive scaling decisions)
- Phase 11 (load testing validates scaling)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Auto-scaling too slow for traffic spike | Pre-warm before known events (flash sale) |
| Cache stampede (many cache misses at once) | Stale-while-revalidate or distributed lock |
| DB connection pool exhaustion | Monitor connections, use connection pooling (PgBouncer) |

## 13. Common Mistakes

- No max limit on auto-scaling (infinite cost)
- Caching without invalidation (stale data)
- Not pre-warming before predictable traffic spikes (Black Friday)
- Adding read replicas before optimizing queries
- Kafka consumers > partitions (extra consumers sit idle)

## 14. Best Practices

- Scale based on business metrics (orders/min) not just CPU
- Cache invalidation via events (ProductUpdated → delete cache key)
- Set auto-scaling cooldown to prevent thrashing
- Document the scaling path for each component before you need it
