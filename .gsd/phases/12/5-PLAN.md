---
phase: 12
plan: 5
wave: 2
depends_on: [2, 3, 4]
files_modified:
  - apps/notification-service/src/interfaces/controllers/notification.controller.ts
  - apps/notification-service/src/interfaces/dto/send-notification.dto.ts
  - apps/notification-service/src/interfaces/dto/notification-response.dto.ts
  - apps/notification-service/src/infrastructure/services/retry-scheduler.service.ts
  - apps/notification-service/src/infrastructure/services/dlq-processor.service.ts
  - apps/notification-service/src/infrastructure/services/kafka-event-publisher.ts
  - apps/notification-service/src/infrastructure/metrics/notification-metrics.service.ts
  - apps/notification-service/src/notification.module.ts
  - apps/notification-service/src/app.module.ts
  - apps/notification-service/src/main.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "NotificationController delegates only to CommandBus/QueryBus — no business logic"
    - "DTOs use class-validator decorators for input validation"
    - "RetryScheduler runs on interval and processes RETRYING notifications"
    - "DlqProcessor moves FAILED notifications to DLQ topic"
    - "NotificationMetricsService tracks notification_sent_total, notification_failed_total, notification_retry_total counters"
    - "AppModule wires all modules with correct DI bindings (Symbol → concrete class)"
    - "Old consumer/ and notification/ directories are replaced by new architecture"
  artifacts:
    - "apps/notification-service/src/interfaces/controllers/notification.controller.ts exists"
    - "apps/notification-service/src/infrastructure/services/retry-scheduler.service.ts exists"
    - "apps/notification-service/src/infrastructure/metrics/notification-metrics.service.ts exists"
    - "apps/notification-service/src/app.module.ts is updated"
---

# Plan 12.5: Interface Layer, Retry/DLQ, Metrics & Module Wiring

<objective>
Build the interface layer (controller + DTOs), retry scheduler, DLQ processor, Kafka event publisher, notification metrics, and wire everything together in the NestJS module system. Replace the old consumer/ and notification/ module structure.

Purpose: This is the glue plan. After this, the entire notification-service is functional end-to-end.
Output: 10 files (controller, DTOs, retry, DLQ, publisher, metrics, modules, main.ts update).
</objective>

<context>
Load for context:
- apps/notification-service/src/app.module.ts  (current module — being replaced)
- apps/notification-service/src/main.ts  (current entry — being updated)
- apps/notification-service/src/application/handlers/send-notification.handler.ts  (Plan 12.2 — handler to dispatch to)
- apps/notification-service/src/domain/ports/notification-repository.port.ts  (Plan 12.1 — Symbol tokens for DI)
- apps/notification-service/src/infrastructure/kafka/kafka.module.ts  (Plan 12.3)
- apps/notification-service/src/infrastructure/providers/channel-provider.factory.ts  (Plan 12.4)
</context>

<tasks>

<task type="auto">
  <name>Create controller, DTOs, and infrastructure services</name>
  <files>
    apps/notification-service/src/interfaces/controllers/notification.controller.ts
    apps/notification-service/src/interfaces/dto/send-notification.dto.ts
    apps/notification-service/src/interfaces/dto/notification-response.dto.ts
    apps/notification-service/src/infrastructure/services/retry-scheduler.service.ts
    apps/notification-service/src/infrastructure/services/dlq-processor.service.ts
    apps/notification-service/src/infrastructure/services/kafka-event-publisher.ts
    apps/notification-service/src/infrastructure/metrics/notification-metrics.service.ts
  </files>
  <action>
    **SendNotificationDto** (class-validator):
    ```ts
    export class SendNotificationDto {
      @IsString() @IsNotEmpty() recipientId: string;
      @IsEnum(NotificationChannel) channel: NotificationChannel;
      @IsString() @IsNotEmpty() templateSlug: string;
      @IsObject() variables: Record<string, string>;
      @IsOptional() @IsEnum(NotificationPriority) priority?: NotificationPriority;
      @IsOptional() @IsEmail() recipientEmail?: string;
      @IsOptional() @IsString() recipientPhone?: string;
      @IsOptional() @IsObject() metadata?: Record<string, unknown>;
    }
    ```

    **NotificationResponseDto** — simple class with id, status, channel, sentAt fields.

    **NotificationController**:
    ```ts
    @Controller('notifications')
    export class NotificationController {
      constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
      ) {}

      @Post()
      async send(@Body() dto: SendNotificationDto) {
        const correlationId = crypto.randomUUID();
        return this.commandBus.execute(
          new SendNotificationCommand(
            dto.recipientId, dto.channel, dto.templateSlug,
            dto.variables, correlationId, dto.priority,
            dto.recipientEmail, dto.recipientPhone, dto.metadata,
          ),
        );
      }

      @Get(':id')
      async getById(@Param('id') id: string) {
        return this.queryBus.execute(new GetNotificationQuery(id));
      }

      @Post(':id/resend')
      async resend(@Param('id') id: string) {
        return this.commandBus.execute(new RetryNotificationCommand(id));
      }

      @Get('health')
      health() { return { status: 'up', service: 'notification-service' }; }
    }
    ```

    **RetrySchedulerService** — scheduled service:
    ```ts
    @Injectable()
    export class RetrySchedulerService implements OnModuleInit, OnModuleDestroy {
      private intervalId: NodeJS.Timeout;

      constructor(
        @Inject(NOTIFICATION_REPOSITORY) private repo: INotificationRepository,
        private commandBus: CommandBus,
        private metricsService: NotificationMetricsService,
      ) {}

      onModuleInit() {
        // Check for retries every 10 seconds
        this.intervalId = setInterval(() => this.processRetries(), 10_000);
      }

      onModuleDestroy() { clearInterval(this.intervalId); }

      private async processRetries() {
        const retries = await this.repo.findPendingRetries(10);
        for (const notification of retries) {
          try {
            await this.commandBus.execute(
              new RetryNotificationCommand(notification.toJSON().id),
            );
            this.metricsService.incrementRetries();
          } catch (error) {
            this.logger.error(`Retry failed for ${notification.toJSON().id}: ${error.message}`);
          }
        }
      }
    }
    ```
    NOTE: Uses setInterval for simplicity. In production with @nestjs/schedule, use @Cron or @Interval.

    **DlqProcessorService** — moves FAILED notifications to DLQ:
    - Similar interval-based service
    - Finds FAILED notifications via repo
    - Calls `notification.markDlq()`, saves
    - Publishes to Kafka DLQ topic via a producer

    **KafkaEventPublisher** — implements `IEventPublisher`:
    - Uses kafkajs Producer to publish domain events
    - Serializes BaseDomainEvent to JSON
    - Publishes to `notification.events` topic
    - Has fallback logging if Kafka publish fails (non-critical path)

    **NotificationMetricsService**:
    ```ts
    @Injectable()
    export class NotificationMetricsService {
      private readonly sentCounter = new Map<string, number>();
      private readonly failedCounter = new Map<string, number>();
      private readonly retryCounter = { count: 0 };

      incrementSent(channel: string) { ... }
      incrementFailed(channel: string) { ... }
      incrementRetries() { ... }
      getMetrics(): Record<string, any> { ... }
    }
    ```
    NOTE: Simple counter-based metrics. In production, use prom-client for Prometheus integration.

    AVOID putting any business logic in the controller — it's a thin adapter.
    AVOID complex scheduling in this phase — simple setInterval is fine for production-readiness, cron can come later.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "controller|dto|services|metrics" || echo "Interface layer compiles OK"</verify>
  <done>Controller has 4 endpoints (POST send, GET :id, POST :id/resend, GET health). DTOs validate input with class-validator. RetryScheduler polls every 10s for RETRYING notifications. DlqProcessor moves FAILED to DLQ. KafkaEventPublisher implements IEventPublisher. NotificationMetricsService tracks sent/failed/retry counters.</done>
</task>

<task type="auto">
  <name>Wire up AppModule, NotificationModule, and update main.ts</name>
  <files>
    apps/notification-service/src/notification.module.ts
    apps/notification-service/src/app.module.ts
    apps/notification-service/src/main.ts
  </files>
  <action>
    **notification.module.ts** — the master module replacing old NotificationModule + ConsumerModule:
    ```ts
    @Module({
      imports: [CqrsModule, KafkaModule],
      controllers: [NotificationController],
      providers: [
        // Handlers
        SendNotificationHandler,
        RetryNotificationHandler,
        MoveToDlqHandler,
        GetNotificationHandler,

        // Application services
        NotificationOrchestrator,

        // Infrastructure — DI bindings (Symbol → concrete)
        {
          provide: NOTIFICATION_REPOSITORY,
          useClass: InMemoryNotificationRepository,
        },
        {
          provide: TEMPLATE_REPOSITORY,
          useClass: InMemoryTemplateRepository,
        },
        {
          provide: CHANNEL_PROVIDER_FACTORY,
          useClass: ChannelProviderFactory,
        },
        {
          provide: EVENT_PUBLISHER,
          useClass: KafkaEventPublisher,
        },

        // Providers (injected into factory)
        SendGridEmailProvider,
        TwilioSmsProvider,
        FirebasePushProvider,
        InAppProvider,

        // Scheduled services
        RetrySchedulerService,
        DlqProcessorService,

        // Metrics
        NotificationMetricsService,
      ],
    })
    export class NotificationCoreModule {}
    ```

    **app.module.ts** — simplified:
    ```ts
    @Module({
      imports: [getLoggerModule(), NotificationCoreModule],
      controllers: [AppController],
      providers: [AppService],
    })
    export class AppModule {}
    ```
    NOTE: Remove old ConsumerModule and NotificationModule imports.

    **main.ts** — add ValidationPipe:
    ```ts
    async function bootstrap() {
      const app = await NestFactory.create(AppModule, { bufferLogs: true });
      app.useLogger(app.get(Logger));
      app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }));
      await app.listen(process.env.PORT ?? 3000);
    }
    ```

    Delete the old module files:
    - `src/consumer/consumer.module.ts` — REMOVE
    - `src/consumer/notification-consumer.service.ts` — REMOVE
    - `src/notification/notification.module.ts` — REMOVE
    - `src/notification/notification.service.ts` — REMOVE

    CRITICAL: The Symbol → concrete class bindings are the DI wiring that makes Clean Architecture work. Change `useClass` to swap implementations (e.g., InMemoryNotificationRepository → TypeOrmNotificationRepository).
  </action>
  <verify>npx tsc --noEmit 2>&1 | head -5 && echo "---" && ls apps/notification-service/src/consumer/ 2>&1 || echo "Old consumer dir removed"</verify>
  <done>NotificationCoreModule wires all handlers, services, and DI bindings with Symbol → concrete class. AppModule imports NotificationCoreModule instead of old modules. main.ts adds ValidationPipe. Old consumer/ and notification/ directories removed.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors
- [ ] NotificationController has no business logic — only CommandBus/QueryBus dispatch
- [ ] DI bindings use Symbol tokens from port files
- [ ] Old `src/consumer/` and `src/notification/` directories no longer exist
- [ ] main.ts has ValidationPipe configured
</verification>

<success_criteria>
- [ ] Controller, DTOs, retry/DLQ, publisher, metrics, modules created
- [ ] End-to-end path works: Kafka event → Consumer → Orchestrator → CommandBus → Handler → Provider
- [ ] TypeScript compiles without errors
- [ ] Clean module structure with Symbol-based DI
</success_criteria>
