# Runbooks

> **Purpose:** Step-by-step procedures for handling production incidents. Every P1/P2 alert
> links to a runbook. No runbook = no alert.

---

## Runbook Template

```markdown
## Alert: [Alert Name]
**Severity:** P1/P2 | **Dashboard:** [link] | **Last Updated:** [date]

### Impact
What customers/systems are affected.

### Diagnosis
1. Check [specific thing]
2. Look at [specific dashboard/log query]
3. Verify [specific condition]

### Resolution
**If [condition A]:** Do X, Y, Z
**If [condition B]:** Do A, B, C

### Escalation
After 15 min → Team Lead | After 30 min → Eng Manager | After 60 min → VP Eng

### Post-Incident
Write incident report within 24 hours.
```

---

## Runbook: Service Down (P1)

**Diagnosis:**
1. `aws ecs describe-services --cluster prod --services {service}-prod` → check `runningCount`
2. Check CloudWatch logs for crash reason: `filter level = "error" | sort @timestamp desc`
3. Check if recent deployment: GitHub Actions → last deployment time

**Resolution:**
- If crash loop → rollback: `aws ecs update-service --task-definition {service}:{prev-rev}`
- If resource exhaustion → increase CPU/memory in task definition
- If dependency failure → check downstream DB/Redis/Kafka health

---

## Runbook: High Error Rate (P1)

**Diagnosis:**
1. CloudWatch Insights: `filter level = "error" | stats count() by message | sort count desc`
2. Check if one endpoint or all endpoints affected
3. Check recent deployments

**Resolution:**
- If one endpoint → likely code bug → rollback or hot-fix
- If all endpoints → likely infrastructure → check DB connections, Redis, Kafka connectivity
- If external API (Stripe) → circuit breaker should be open → verify fallback

---

## Runbook: High Kafka Consumer Lag (P2)

**Diagnosis:**
1. Check MSK dashboard → which consumer group is lagging
2. Check consumer service health: is it running? is it OOMing?
3. Check if lag is growing or stable

**Resolution:**
- If consumer crashed → restart: `aws ecs update-service --force-new-deployment`
- If processing too slow → check for slow DB queries in consumer
- If partition imbalance → check consumer instance count vs partition count
- If sustained lag → scale up consumer instances

---

## Runbook: Circuit Breaker Open (P2)

**Diagnosis:**
1. Which service's circuit breaker? Check `circuit_breaker_state` metric
2. Check target service health
3. Check network connectivity between services

**Resolution:**
- If target service is down → fix target service first
- If target service is healthy → check timeout configuration
- Circuit breaker auto-resets after timeout (half-open state)

---

## Runbook: Database Connection Saturation (P2)

**Diagnosis:**
1. RDS console → Monitoring → check `DatabaseConnections` metric
2. Check which service is consuming most connections
3. `SELECT count(*), state FROM pg_stat_activity GROUP BY state;`

**Resolution:**
- If idle connections → check connection pool configuration (max pool size)
- If active queries → check for long-running queries: `SELECT * FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC;`
- Kill stuck queries: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE duration > interval '5 minutes';`
- Increase `max_connections` in RDS parameter group (requires reboot)

---

## Runbook: DLQ Messages Accumulating (P3)

**Diagnosis:**
1. Check which DLQ topic has messages: `kafka-consumer-groups.sh --describe`
2. Read DLQ messages to understand the error
3. Check if issue is data-related (bad event) or infra-related (DB down)

**Resolution:**
- If bad data → fix data, replay corrected event
- If transient failure → replay DLQ messages after fixing root cause
- If schema mismatch → update consumer, then replay

---

## Runbook: Deployment Rollback

```bash
# Step 1: Identify the previous good revision
aws ecs describe-services --cluster ecommerce-prod --services {service}-prod \
  --query 'services[0].taskDefinition'

# Step 2: List recent revisions
aws ecs list-task-definitions --family-prefix {service} --sort DESC --max-items 5

# Step 3: Rollback
aws ecs update-service --cluster ecommerce-prod --service {service}-prod \
  --task-definition {service}:{previous-revision}

# Step 4: Wait for stability
aws ecs wait services-stable --cluster ecommerce-prod --services {service}-prod

# Step 5: Verify
curl -s https://api.example.com/api/{service}/health | jq .
```
