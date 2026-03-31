# Phase 3 — Platform / Core Shared Modules

> **Why this phase exists:** Without shared modules, every service re-invents logging, error handling,
> database connections, Kafka producers, and circuit breakers. You end up with 10 slightly different
> implementations of the same thing, and when you need to change the log format, you update 10 services.
> Shared modules enforce consistency and let service teams focus on business logic.

---

## 3.1 Module Architecture

### Package Structure

```
packages/
├── core/                          # @ecommerce/core
│   └── src/
│       ├── index.ts               # Public API exports
│       ├── filters/               # Exception filters
│       │   └── global-exception.filter.ts
│       ├── interceptors/          # Request/Response interceptors
│       │   ├── logging.interceptor.ts
│       │   └── timeout.interceptor.ts
│       ├── kafka/                 # Kafka producer/consumer base
│       │   ├── kafka-producer.service.ts
│       │   ├── base-event-consumer.ts
│       │   ├── outbox/
│       │   │   ├── outbox.entity.ts
│       │   │   ├── outbox.service.ts
│       │   │   └── outbox-relay.service.ts
│       │   └── inbox/
│       │       ├── inbox.entity.ts
│       │       ├── inbox.service.ts
│       │       └── inbox-processor.ts
│       ├── observability/         # Logging, metrics, tracing
│       │   ├── logger.service.ts
│       │   ├── metrics.service.ts
│       │   └── tracing.module.ts
│       ├── persistence/           # Database utilities
│       │   ├── base.repository.ts
│       │   ├── base.entity.ts
│       │   └── database.module.ts
│       ├── resilience/            # Circuit breaker, retry, rate limit
│       │   ├── circuit-breaker.ts
│       │   ├── retry.decorator.ts
│       │   └── rate-limiter.ts
│       └── security/              # Auth, tenant, guards
│           ├── jwt-auth.guard.ts
│           ├── roles.guard.ts
│           └── tenant-context.middleware.ts
│
├── events/                        # @ecommerce/events
│   └── src/
│       ├── index.ts
│       ├── envelope.ts            # Event envelope (metadata wrapper)
│       ├── product.events.ts
│       ├── order.events.ts
│       ├── inventory.events.ts
│       ├── payment.events.ts
│       ├── user.events.ts
│       ├── cart.events.ts
│       └── notification.events.ts
│
└── shared-types/                  # @ecommerce/shared-types
    └── src/
        ├── index.ts
        ├── pagination.ts
        ├── api-response.ts
        └── common.types.ts
```

### Design Principles

| Principle | Explanation |
|-----------|-------------|
| **No business logic** | Core modules are infrastructure only |
| **NestJS-native** | Use modules, providers, decorators — not raw classes |
| **Configurable** | Everything customizable via module options |
| **Zero runtime coupling** | Services import types, not running instances |
| **Independently versioned** | Each package has its own `package.json` |

---

## 3.2 Logger Module

### Requirements

- Structured JSON output (machine-parseable)
- Correlation ID propagation (from request to logs to Kafka)
- Service name, environment, timestamp in every log
- Configurable log level per environment
- Compatible with CloudWatch, ELK, Datadog

### Implementation Pattern

```typescript
// packages/core/src/observability/logger.service.ts
import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';

export interface LogContext {
  traceId?: string;
  spanId?: string;
  userId?: string;
  tenantId?: string;
  service?: string;
  [key: string]: any;
}

@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLogger implements NestLoggerService {
  private context: LogContext = {};

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  log(message: string, metadata?: Record<string, any>): void {
    this.emit('info', message, metadata);
  }

  error(message: string, trace?: string, metadata?: Record<string, any>): void {
    this.emit('error', message, { ...metadata, stackTrace: trace });
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.emit('warn', message, metadata);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.emit('debug', message, metadata);
  }

  private emit(level: string, message: string, metadata?: Record<string, any>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: process.env.SERVICE_NAME || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      ...this.context,
      message,
      ...metadata,
    };
    // stdout for CloudWatch/container logs
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
```

### Usage in Services

```typescript
@Controller('orders')
export class OrderController {
  constructor(private readonly logger: StructuredLogger) {
    this.logger.setContext({ service: 'order-service' });
  }

  @Post()
  async createOrder(@Body() dto: CreateOrderDto, @Req() req: Request) {
    this.logger.log('Creating order', {
      userId: req.user.id,
      tenantId: req.tenantId,
      itemCount: dto.items.length,
    });
    // ...
  }
}
```

---

## 3.3 Tracing Module

### OpenTelemetry Integration

```typescript
// packages/core/src/observability/tracing.module.ts
import { Module, DynamicModule } from '@nestjs/common';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

export interface TracingModuleOptions {
  serviceName: string;
  exporterUrl?: string;
  enabled?: boolean;
}

@Module({})
export class TracingModule {
  static forRoot(options: TracingModuleOptions): DynamicModule {
    if (!options.enabled) return { module: TracingModule };

    const sdk = new NodeSDK({
      serviceName: options.serviceName,
      traceExporter: new OTLPTraceExporter({
        url: options.exporterUrl || 'http://otel-collector:4318/v1/traces',
      }),
      instrumentations: [
        new HttpInstrumentation(),
        new NestInstrumentation(),
      ],
    });

    sdk.start();

    return {
      module: TracingModule,
      global: true,
    };
  }
}
```

---

## 3.4 Metrics Module

```typescript
// packages/core/src/observability/metrics.service.ts
import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry: Registry;
  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestTotal: Counter;
  private readonly businessEventTotal: Counter;

  constructor() {
    this.registry = new Registry();

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'path', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code'],
      registers: [this.registry],
    });

    this.businessEventTotal = new Counter({
      name: 'business_events_total',
      help: 'Total number of business events',
      labelNames: ['event_type', 'status'],
      registers: [this.registry],
    });
  }

  recordHttpRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    this.httpRequestDuration.observe(
      { method, path, status_code: statusCode.toString() },
      durationMs / 1000,
    );
    this.httpRequestTotal.inc({ method, path, status_code: statusCode.toString() });
  }

  recordBusinessEvent(eventType: string, status: 'success' | 'failure'): void {
    this.businessEventTotal.inc({ event_type: eventType, status });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
```

---

## 3.5 Error Handling (Global Exception Filter)

```typescript
// packages/core/src/filters/global-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { StructuredLogger } from '../observability/logger.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.message
      : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      traceId: request.headers['x-correlation-id'] || 'unknown',
    };

    // Log with full context
    this.logger.error('Request failed', exception instanceof Error ? exception.stack : '', {
      statusCode: status,
      path: request.url,
      method: request.method,
      userId: request.user?.id,
    });

    response.status(status).json(errorResponse);
  }
}
```

### Standardized Error Response

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/orders",
  "traceId": "trace-abc-123",
  "errors": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "quantity", "message": "Must be greater than 0" }
  ]
}
```

---

## 3.6 Base Repository

```typescript
// packages/core/src/persistence/base.repository.ts
import { Repository, FindOptionsWhere, DeepPartial } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

export abstract class BaseRepository<T extends { id: string }> {
  constructor(protected readonly repo: Repository<T>) {}

  async findById(id: string): Promise<T> {
    const entity = await this.repo.findOne({ where: { id } as FindOptionsWhere<T> });
    if (!entity) {
      throw new NotFoundException(`${this.repo.metadata.name} with id ${id} not found`);
    }
    return entity;
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    tenantId?: string;
  }): Promise<{ data: T[]; total: number; page: number; limit: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;

    const where: any = {};
    if (options?.tenantId) where.tenantId = options.tenantId;

    const [data, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create(data);
    return this.repo.save(entity as any);
  }

  async update(id: string, data: DeepPartial<T>): Promise<T> {
    await this.findById(id); // Ensure exists
    await this.repo.update(id, data as any);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id); // Ensure exists
    await this.repo.delete(id);
  }
}
```

---

## 3.7 Event Bus (Kafka Producer)

```typescript
// packages/core/src/kafka/kafka-producer.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer, Partitioners } from 'kafkajs';
import { StructuredLogger } from '../observability/logger.service';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer;

  constructor(
    private readonly logger: StructuredLogger,
  ) {
    const kafka = new Kafka({
      clientId: process.env.SERVICE_NAME,
      brokers: (process.env.KAFKA_BROKERS || '').split(','),
    });

    this.producer = kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
      idempotent: true,               // Exactly-once semantics
      maxInFlightRequests: 5,
      retry: { retries: 5 },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(topic: string, message: {
    key: string;
    value: any;
    headers?: Record<string, string>;
  }): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{
        key: message.key,
        value: JSON.stringify(message.value),
        headers: {
          'correlation-id': message.headers?.['correlation-id'] || '',
          'event-type': message.headers?.['event-type'] || '',
          'source-service': process.env.SERVICE_NAME || '',
          'timestamp': new Date().toISOString(),
          ...message.headers,
        },
      }],
    });

    this.logger.log('Event published', { topic, key: message.key });
  }
}
```

---

## 3.8 Outbox Pattern

### Why Outbox?

The Outbox pattern guarantees that a database write and event emission happen atomically (or not at all).

```
WITHOUT Outbox (Dual Write Problem):
  1. Save order to DB ── ✅ succeeds
  2. Publish event to Kafka ── ❌ fails (network issue)
  Result: Order exists but no event → inconsistent state

WITH Outbox Pattern:
  1. In same DB transaction:
     a. Save order to orders table
     b. Save event to outbox table
  2. Background relay reads outbox → publishes to Kafka
  3. Mark outbox entry as published
  Result: If DB commit succeeds, event WILL eventually be published
```

### Outbox Entity

```typescript
// packages/core/src/kafka/outbox/outbox.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('outbox_events')
export class OutboxEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  topic: string;

  @Column()
  partitionKey: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  headers: Record<string, string>;

  @Column({ default: false })
  published: boolean;

  @Column({ default: 0 })
  retryCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  publishedAt: Date;
}
```

### Outbox Relay (Background Worker)

```typescript
// packages/core/src/kafka/outbox/outbox-relay.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { OutboxEventEntity } from './outbox.entity';
import { KafkaProducerService } from '../kafka-producer.service';
import { StructuredLogger } from '../../observability/logger.service';

@Injectable()
export class OutboxRelayService {
  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly outboxRepo: Repository<OutboxEventEntity>,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly logger: StructuredLogger,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async relayEvents(): Promise<void> {
    const events = await this.outboxRepo.find({
      where: { published: false },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    for (const event of events) {
      try {
        await this.kafkaProducer.publish(event.topic, {
          key: event.partitionKey,
          value: event.payload,
          headers: event.headers,
        });

        event.published = true;
        event.publishedAt = new Date();
        await this.outboxRepo.save(event);
      } catch (error) {
        event.retryCount += 1;
        await this.outboxRepo.save(event);
        this.logger.error('Failed to relay outbox event', error.stack, {
          eventId: event.id,
          retryCount: event.retryCount,
        });
      }
    }
  }
}
```

---

## 3.9 Inbox Pattern

### Why Inbox?

The Inbox pattern guarantees **exactly-once processing** of consumed events. It prevents duplicate
processing when Kafka redelivers messages.

```typescript
// packages/core/src/kafka/inbox/inbox.entity.ts
@Entity('inbox_events')
export class InboxEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  eventId: string;              // Deduplication key

  @Column()
  topic: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ default: 'PENDING' })
  status: 'PENDING' | 'PROCESSED' | 'FAILED' | 'DLQ';

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  processedAt: Date;
}
```

### Base Event Consumer

```typescript
// packages/core/src/kafka/base-event-consumer.ts
import { InboxService } from './inbox/inbox.service';
import { StructuredLogger } from '../observability/logger.service';

export abstract class BaseEventConsumer {
  constructor(
    protected readonly inboxService: InboxService,
    protected readonly logger: StructuredLogger,
  ) {}

  async handleEvent(eventId: string, topic: string, payload: any): Promise<void> {
    // Deduplicate
    const isDuplicate = await this.inboxService.isDuplicate(eventId);
    if (isDuplicate) {
      this.logger.debug('Skipping duplicate event', { eventId, topic });
      return;
    }

    // Store in inbox
    await this.inboxService.store({ eventId, topic, payload });

    try {
      // Process event (implemented by each consumer)
      await this.processEvent(payload);

      // Mark as processed
      await this.inboxService.markProcessed(eventId);
    } catch (error) {
      await this.inboxService.markFailed(eventId, error.message);
      throw error; // Let Kafka retry
    }
  }

  protected abstract processEvent(payload: any): Promise<void>;
}
```

---

## 3.10 Idempotency Module

```typescript
// packages/core/src/resilience/idempotency.decorator.ts
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: Redis) {}

  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    options: { ttlSeconds?: number } = {},
  ): Promise<T> {
    const ttl = options.ttlSeconds || 86400; // 24 hours default

    // Check if already processed
    const cached = await this.redis.get(`idempotency:${key}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Acquire lock to prevent concurrent execution
    const lockAcquired = await this.redis.set(
      `idempotency:lock:${key}`, '1', 'EX', 30, 'NX',
    );

    if (!lockAcquired) {
      // Another instance is processing — wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      const result = await this.redis.get(`idempotency:${key}`);
      if (result) return JSON.parse(result);
      throw new Error('Idempotency lock timeout');
    }

    try {
      const result = await operation();

      // Cache the result
      await this.redis.set(
        `idempotency:${key}`,
        JSON.stringify(result),
        'EX', ttl,
      );

      return result;
    } finally {
      await this.redis.del(`idempotency:lock:${key}`);
    }
  }
}
```

---

## 3.11 Auth/JWT Guard

```typescript
// packages/core/src/security/jwt-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    try {
      const token = authHeader.substring(7);
      const payload = this.jwtService.verify(token);

      request.user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
        tenantId: payload.tenantId,
      };

      // Set correlation context for logging
      request.tenantId = payload.tenantId;

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
```

---

## 3.12 Circuit Breaker

```typescript
// packages/core/src/resilience/circuit-breaker.ts
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject all calls
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

export interface CircuitBreakerOptions {
  failureThreshold: number;    // # failures before opening (default: 5)
  resetTimeoutMs: number;      // Time before trying again (default: 30000)
  monitorWindowMs: number;     // Failure counting window (default: 60000)
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime: number = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = {
      failureThreshold: options?.failureThreshold || 5,
      resetTimeoutMs: options?.resetTimeoutMs || 30000,
      monitorWindowMs: options?.monitorWindowMs || 60000,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }
}
```

---

## 3.13 Retry Module

```typescript
// packages/core/src/resilience/retry.decorator.ts
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: Array<new (...args: any[]) => Error>;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  },
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (options.retryableErrors?.length) {
        const isRetryable = options.retryableErrors.some(
          errClass => error instanceof errClass,
        );
        if (!isRetryable) throw error;
      }

      if (attempt === options.maxRetries) break;

      // Exponential backoff with jitter
      const delay = Math.min(
        options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt)
          + Math.random() * 100,  // Jitter
        options.maxDelayMs,
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

---

## 3.14 Health Check Module

```typescript
// packages/core/src/health/health.module.ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

```typescript
// packages/core/src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck, HealthCheckService, TypeOrmHealthIndicator,
  MemoryHealthIndicator, DiskHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024), // 300MB
    ]);
  }

  @Get('liveness')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

---

## 3.15 Config Module

```typescript
// packages/core/src/config/config.module.ts
import { Module, Global, DynamicModule } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

export interface ServiceConfig {
  port: number;
  serviceName: string;
  environment: string;
  database?: {
    host: string;
    port: number;
    name: string;
    username: string;
    password: string;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  kafka?: {
    brokers: string[];
    groupId: string;
  };
}

@Global()
@Module({})
export class ServiceConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: ServiceConfigModule,
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          envFilePath: [
            `.env.${process.env.NODE_ENV || 'development'}.local`,
            `.env.${process.env.NODE_ENV || 'development'}`,
            '.env.local',
            '.env',
          ],
          load: [
            () => ({
              port: parseInt(process.env.PORT || '3000', 10),
              serviceName: process.env.SERVICE_NAME || 'unknown',
              environment: process.env.NODE_ENV || 'development',
            }),
          ],
        }),
      ],
    };
  }
}
```

---

## 3.16 Rate Limiter

```typescript
// packages/core/src/resilience/rate-limiter.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(
    key: string,
    options: { maxRequests: number; windowSeconds: number },
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / 1000 / options.windowSeconds)}`;

    const current = await this.redis.incr(windowKey);
    if (current === 1) {
      await this.redis.expire(windowKey, options.windowSeconds);
    }

    const remaining = Math.max(0, options.maxRequests - current);
    const resetAt = Math.ceil(Date.now() / 1000 / options.windowSeconds) * options.windowSeconds;

    if (current > options.maxRequests) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          retryAfter: resetAt - Math.floor(Date.now() / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { allowed: true, remaining, resetAt };
  }
}
```

---

## Module Dependency Graph

```
@ecommerce/shared-types
  └─► Used by all packages and services (types only, no runtime)

@ecommerce/events
  └─► Depends on: @ecommerce/shared-types
  └─► Used by: all services that publish/consume events

@ecommerce/core
  ├─► Depends on: @ecommerce/events, @ecommerce/shared-types
  ├─► filters/         → Used by all services
  ├─► interceptors/    → Used by all services
  ├─► kafka/           → Used by services with Kafka
  ├─► observability/   → Used by all services
  ├─► persistence/     → Used by services with PostgreSQL
  ├─► resilience/      → Used by services making HTTP/external calls
  └─► security/        → Used by all services with auth
```

---

## Common Mistakes

> [!CAUTION]
> - **Putting business logic in shared modules.** The `@ecommerce/core` package should NEVER import
>   from `apps/*`. If you find yourself doing this, the logic belongs in the service.
> - **Circular dependencies.** If `core` depends on `events` AND `events` depends on `core`,
>   you have a circular dep. Break it by extracting shared types.
> - **Over-abstracting.** A `BaseService<T>` that tries to handle every use case becomes an
>   unmaintainable god class. Keep abstractions thin.
> - **Not versioning packages.** When you change `@ecommerce/core`, all services pull the change.
>   Use semver and test before publishing.

---

> **Next →** [Phase 4 — Microservices Design](./phase-04-microservices-design.md)
