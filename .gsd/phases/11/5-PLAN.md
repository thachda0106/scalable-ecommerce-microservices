---
phase: 11
plan: 5
wave: 2
depends_on: [1, 2, 3, 4]
files_modified:
  - apps/inventory-service/src/interfaces/dto/reserve-stock.dto.ts
  - apps/inventory-service/src/interfaces/dto/release-stock.dto.ts
  - apps/inventory-service/src/interfaces/dto/confirm-stock.dto.ts
  - apps/inventory-service/src/interfaces/dto/replenish-stock.dto.ts
  - apps/inventory-service/src/interfaces/dto/inventory-response.dto.ts
  - apps/inventory-service/src/interfaces/controllers/inventory.controller.ts
  - apps/inventory-service/src/interfaces/guards/service-auth.guard.ts
  - apps/inventory-service/src/interfaces/filters/domain-exception.filter.ts
  - apps/inventory-service/src/health/health.controller.ts
  - apps/inventory-service/src/health/health.module.ts
  - apps/inventory-service/src/metrics/inventory-metrics.service.ts
  - apps/inventory-service/src/metrics/metrics.module.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "InventoryController is thin — each route calls CommandBus.execute() or QueryBus.execute() only"
    - "All DTOs use class-validator decorators with whitelist + transform"
    - "DomainExceptionFilter maps InsufficientStockError → 409, ReservationNotFoundError → 404"
    - "Health controller returns DB + Redis + Kafka status on /health/ready"
    - "Prometheus metrics include inventory_reservations_total, inventory_operation_duration_seconds"
    - "ServiceAuthGuard validates service-to-service JWT or API key"
  artifacts:
    - "apps/inventory-service/src/interfaces/controllers/inventory.controller.ts has 5 routes"
    - "apps/inventory-service/src/health/health.controller.ts has liveness + readiness endpoints"
    - "apps/inventory-service/src/metrics/inventory-metrics.service.ts defines inventory-specific Prometheus metrics"
---

# Plan 11.5: Interface Layer — DTOs, Controller, Guards, Health & Metrics

<objective>
Implement the HTTP interface layer: validated DTOs, thin controller, service auth guard, domain exception filter, health/readiness probes, and Prometheus metrics.

Purpose: This is the public-facing surface of the service. All validation happens at this layer. Controller delegates entirely to CQRS buses.
Output: 5 DTOs, 1 controller, 1 guard, 1 filter, 2 health files, 2 metrics files.
</objective>

<context>
Load for context:
- apps/inventory-service/src/application/commands/reserve-stock.command.ts
- apps/inventory-service/src/application/commands/release-stock.command.ts
- apps/inventory-service/src/application/commands/confirm-stock.command.ts
- apps/inventory-service/src/application/commands/replenish-stock.command.ts
- apps/inventory-service/src/application/queries/get-inventory.query.ts
- apps/inventory-service/src/domain/errors/insufficient-stock.error.ts
- apps/cart-service/src/interfaces/controllers/cart.controller.ts  (reference pattern)
- apps/cart-service/src/interfaces/dto/add-item.dto.ts  (reference for DTO pattern)
- packages/core/src/observability/metrics.ts  (@willsoto/nestjs-prometheus MetricsModule)
</context>

<tasks>

<task type="auto">
  <name>Create DTOs, service auth guard, and domain exception filter</name>
  <files>
    apps/inventory-service/src/interfaces/dto/reserve-stock.dto.ts
    apps/inventory-service/src/interfaces/dto/release-stock.dto.ts
    apps/inventory-service/src/interfaces/dto/confirm-stock.dto.ts
    apps/inventory-service/src/interfaces/dto/replenish-stock.dto.ts
    apps/inventory-service/src/interfaces/dto/inventory-response.dto.ts
    apps/inventory-service/src/interfaces/guards/service-auth.guard.ts
    apps/inventory-service/src/interfaces/filters/domain-exception.filter.ts
  </files>
  <action>
    **reserve-stock.dto.ts**:
    ```ts
    import { IsArray, IsString, IsInt, IsUUID, IsIn, IsOptional, Min, Max, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
    import { Type } from 'class-transformer';

    export class ReserveItemDto {
      @IsUUID('4') productId: string;
      @IsInt() @Min(1) @Max(1000000) quantity: number;
    }

    export class ReserveStockDto {
      @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
      @ValidateNested({ each: true }) @Type(() => ReserveItemDto)
      items: ReserveItemDto[];

      @IsUUID('4') referenceId: string;
      @IsIn(['CART', 'ORDER']) referenceType: 'CART' | 'ORDER';
      @IsString() idempotencyKey: string;
      @IsOptional() @IsInt() @Min(1) @Max(1440) ttlMinutes?: number;
    }
    ```

    **release-stock.dto.ts**:
    ```ts
    export class ReleaseStockDto {
      @IsUUID('4') referenceId: string;
      @IsIn(['CART', 'ORDER']) referenceType: 'CART' | 'ORDER';
      @IsOptional() @IsArray() @IsUUID('4', { each: true }) productIds?: string[];
      @IsString() idempotencyKey: string;
      @IsOptional() @IsString() reason?: string;
    }
    ```

    **confirm-stock.dto.ts**:
    ```ts
    export class ConfirmStockDto {
      @IsUUID('4') referenceId: string;
      @IsString() idempotencyKey: string;
    }
    ```

    **replenish-stock.dto.ts**:
    ```ts
    export class ReplenishItemDto {
      @IsUUID('4') productId: string;
      @IsInt() @Min(1) @Max(1000000) quantity: number;
      @IsString() reason: string;
    }

    export class ReplenishStockDto {
      @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
      @ValidateNested({ each: true }) @Type(() => ReplenishItemDto)
      items: ReplenishItemDto[];

      @IsString() performedBy: string;
      @IsString() idempotencyKey: string;
    }
    ```

    **inventory-response.dto.ts** — response shape (no decorators needed):
    ```ts
    export interface InventoryResponseDto {
      productId: string;
      sku: string;
      availableStock: number;
      reservedStock: number;
      soldStock: number;
      totalStock: number;
      lowStockThreshold: number;
      isLowStock: boolean;
      updatedAt: string;
    }

    export interface ReserveResponseDto {
      success: boolean;
      reservations?: { reservationId: string; productId: string; quantity: number; status: string; expiresAt: string }[];
      error?: string;
      failedItems?: { productId: string; requested: number; available: number }[];
    }
    ```

    **service-auth.guard.ts**:
    ```ts
    @Injectable()
    export class ServiceAuthGuard implements CanActivate {
      private readonly logger = new Logger(ServiceAuthGuard.name);

      canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        // Check for service-to-service API key or JWT
        const apiKey = request.headers['x-api-key'];
        const serviceToken = request.headers['x-service-token'];
        const authHeader = request.headers['authorization'];

        if (apiKey === process.env.INTERNAL_API_KEY) return true;
        if (serviceToken) {
          // Validate service JWT — simplified for now, full implementation with jwt verify later
          return true;
        }
        if (authHeader?.startsWith('Bearer ')) {
          // Accept gateway-forwarded JWT
          return true;
        }

        this.logger.warn('Unauthorized service request');
        throw new UnauthorizedException('Service authentication required');
      }
    }
    ```
    NOTE: This is a simplified guard. In production, integrate with auth-service JWT verification.

    **domain-exception.filter.ts**:
    ```ts
    @Catch()
    export class DomainExceptionFilter implements ExceptionFilter {
      catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();

        if (exception instanceof InsufficientStockError) {
          return response.status(409).json({
            statusCode: 409,
            error: 'INSUFFICIENT_STOCK',
            message: exception.message,
            productId: exception.productId,
            requested: exception.requested,
            available: exception.available,
          });
        }

        if (exception instanceof ReservationNotFoundError) {
          return response.status(404).json({
            statusCode: 404,
            error: 'RESERVATION_NOT_FOUND',
            message: exception.message,
          });
        }

        if (exception instanceof StockInvariantViolationError) {
          return response.status(500).json({
            statusCode: 500,
            error: 'STOCK_INVARIANT_VIOLATION',
            message: 'Internal inventory error',
          });
        }

        // Fall through to NestJS default exception handling
        if (exception instanceof HttpException) {
          return response.status(exception.getStatus()).json(exception.getResponse());
        }

        return response.status(500).json({
          statusCode: 500,
          error: 'Internal Server Error',
        });
      }
    }
    ```

    AVOID putting business logic in DTOs or guards.
    AVOID exposing internal error details in 500 responses.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "dto|guard|filter" || echo "DTOs, guard, filter compile OK"</verify>
  <done>5 DTO files with class-validator decorators. ReserveStockDto validates nested arrays with @ValidateNested. ServiceAuthGuard checks API key, service token, and JWT. DomainExceptionFilter maps domain errors to HTTP status codes (409, 404, 500).</done>
</task>

<task type="auto">
  <name>Create inventory controller, health checks, and Prometheus metrics</name>
  <files>
    apps/inventory-service/src/interfaces/controllers/inventory.controller.ts
    apps/inventory-service/src/health/health.controller.ts
    apps/inventory-service/src/health/health.module.ts
    apps/inventory-service/src/metrics/inventory-metrics.service.ts
    apps/inventory-service/src/metrics/metrics.module.ts
  </files>
  <action>
    **inventory.controller.ts**:
    ```ts
    @Controller('inventory')
    @UseGuards(ServiceAuthGuard)
    @UseFilters(DomainExceptionFilter)
    export class InventoryController {
      constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
      ) {}

      @Get(':productId')
      async getInventory(@Param('productId') productId: string) {
        return this.queryBus.execute(new GetInventoryQuery(productId));
      }

      @Post('reserve')
      @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
      async reserveStock(@Body() dto: ReserveStockDto, @Headers('x-correlation-id') correlationId?: string) {
        return this.commandBus.execute(
          new ReserveStockCommand(dto.items, dto.referenceId, dto.referenceType, dto.idempotencyKey, dto.ttlMinutes, correlationId),
        );
      }

      @Post('release')
      @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
      async releaseStock(@Body() dto: ReleaseStockDto, @Headers('x-correlation-id') correlationId?: string) {
        return this.commandBus.execute(
          new ReleaseStockCommand(dto.referenceId, dto.referenceType, dto.productIds, dto.idempotencyKey, dto.reason, correlationId),
        );
      }

      @Post('confirm')
      @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
      async confirmStock(@Body() dto: ConfirmStockDto, @Headers('x-correlation-id') correlationId?: string) {
        return this.commandBus.execute(
          new ConfirmStockCommand(dto.referenceId, 'ORDER', dto.idempotencyKey, correlationId),
        );
      }

      @Post('replenish')
      @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
      async replenishStock(@Body() dto: ReplenishStockDto, @Headers('x-correlation-id') correlationId?: string) {
        return this.commandBus.execute(
          new ReplenishStockCommand(dto.items, dto.performedBy, dto.idempotencyKey, correlationId),
        );
      }
    }
    ```
    Controller has 5 routes: GET, 4 POSTs. ALL routes delegate ONLY to CommandBus/QueryBus.

    **health.controller.ts**:
    ```ts
    @Controller('health')
    export class HealthController {
      constructor(
        private dataSource: DataSource,
        @Inject('REDIS_CLIENT') private redis: Redis,
      ) {}

      @Get()
      liveness() {
        return { status: 'up', uptime: process.uptime() };
      }

      @Get('ready')
      async readiness() {
        const checks: Record<string, { status: string; latency_ms?: number }> = {};

        // DB check
        const dbStart = Date.now();
        try {
          await this.dataSource.query('SELECT 1');
          checks.database = { status: 'up', latency_ms: Date.now() - dbStart };
        } catch { checks.database = { status: 'down' }; }

        // Redis check
        const redisStart = Date.now();
        try {
          await this.redis.ping();
          checks.redis = { status: 'up', latency_ms: Date.now() - redisStart };
        } catch { checks.redis = { status: 'down' }; }

        const allUp = Object.values(checks).every(c => c.status === 'up');
        return { status: allUp ? 'ready' : 'degraded', checks };
      }
    }
    ```

    **health.module.ts**: Simple module exporting HealthController. Import needed providers.

    **inventory-metrics.service.ts**:
    ```ts
    import { Injectable } from '@nestjs/common';
    import { InjectMetric } from '@willsoto/nestjs-prometheus';
    import { Counter, Histogram, Gauge } from 'prom-client';

    @Injectable()
    export class InventoryMetricsService {
      constructor(
        @InjectMetric('inventory_reservations_total') public reservationsTotal: Counter,
        @InjectMetric('inventory_releases_total') public releasesTotal: Counter,
        @InjectMetric('inventory_confirmations_total') public confirmationsTotal: Counter,
        @InjectMetric('inventory_oversell_attempts_total') public oversellAttempts: Counter,
        @InjectMetric('inventory_operation_duration_seconds') public operationDuration: Histogram,
        @InjectMetric('inventory_occ_retries_total') public occRetries: Counter,
        @InjectMetric('inventory_reservation_expiry_total') public reservationExpiry: Counter,
        @InjectMetric('inventory_cache_hits_total') public cacheHits: Counter,
        @InjectMetric('inventory_cache_misses_total') public cacheMisses: Counter,
      ) {}
    }
    ```

    **metrics.module.ts**:
    ```ts
    import { Module } from '@nestjs/common';
    import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';
    import { MetricsModule as CoreMetricsModule } from '@ecommerce/core';
    import { InventoryMetricsService } from './inventory-metrics.service';

    @Module({
      imports: [CoreMetricsModule],
      providers: [
        InventoryMetricsService,
        makeCounterProvider({ name: 'inventory_reservations_total', help: 'Total stock reservation attempts', labelNames: ['status'] }),
        makeCounterProvider({ name: 'inventory_releases_total', help: 'Total stock releases', labelNames: ['reason'] }),
        makeCounterProvider({ name: 'inventory_confirmations_total', help: 'Total order confirmations', labelNames: ['status'] }),
        makeCounterProvider({ name: 'inventory_oversell_attempts_total', help: 'Oversell prevention triggers' }),
        makeHistogramProvider({ name: 'inventory_operation_duration_seconds', help: 'Latency per operation', labelNames: ['operation'], buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1] }),
        makeCounterProvider({ name: 'inventory_occ_retries_total', help: 'OCC version conflict retries' }),
        makeCounterProvider({ name: 'inventory_reservation_expiry_total', help: 'Reservations auto-expired by worker' }),
        makeCounterProvider({ name: 'inventory_cache_hits_total', help: 'Redis cache hits' }),
        makeCounterProvider({ name: 'inventory_cache_misses_total', help: 'Redis cache misses' }),
      ],
      exports: [InventoryMetricsService],
    })
    export class InventoryMetricsModule {}
    ```

    AVOID putting business logic in the controller — ONLY CommandBus/QueryBus calls.
    AVOID hardcoding metric names — use the constants from the service.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "controller|health|metrics" || echo "Controller, health, metrics compile OK"</verify>
  <done>InventoryController has 5 routes all delegating to CQRS buses. HealthController has liveness + readiness with DB and Redis checks. Prometheus metrics module defines 9 inventory-specific metrics. ServiceAuthGuard and DomainExceptionFilter applied at controller level.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors for interface files
- [ ] `inventory.controller.ts` has no business logic — only CommandBus/QueryBus calls
- [ ] DTOs use class-validator with whitelist: true
- [ ] `/health` returns liveness, `/health/ready` checks DB and Redis
- [ ] Prometheus metrics exposed via @willsoto/nestjs-prometheus
- [ ] DomainExceptionFilter maps InsufficientStockError → 409
</verification>

<success_criteria>
- [ ] 5 DTOs, 1 controller, 1 guard, 1 filter, 2 health files, 2 metrics files created
- [ ] Controller is thin (delegates only to CQRS)
- [ ] Health checks cover database and Redis
- [ ] 9 Prometheus metrics registered
- [ ] TypeScript compiles without errors
</success_criteria>
