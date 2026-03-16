import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Kafka
import { KafkaModule } from './infrastructure/kafka/kafka.module';

// Interface layer
import { NotificationController } from './interfaces/controllers/notification.controller';

// Application — Handlers
import { SendNotificationHandler } from './application/handlers/send-notification.handler';
import { RetryNotificationHandler } from './application/handlers/retry-notification.handler';
import { MoveToDlqHandler } from './application/handlers/move-to-dlq.handler';
import { GetNotificationHandler } from './application/handlers/get-notification.handler';

// Application — Services
import { NotificationOrchestrator } from './application/services/notification-orchestrator.service';

// Domain — Port tokens
import { NOTIFICATION_REPOSITORY } from './domain/ports/notification-repository.port';
import { TEMPLATE_REPOSITORY } from './domain/ports/template-repository.port';
import { CHANNEL_PROVIDER_FACTORY } from './domain/ports/channel-provider.port';
import { EVENT_PUBLISHER } from './domain/ports/event-publisher.port';

// Infrastructure — Concrete implementations
import { InMemoryNotificationRepository } from './infrastructure/repositories/in-memory-notification.repository';
import { InMemoryTemplateRepository } from './infrastructure/repositories/in-memory-template.repository';
import { ChannelProviderFactory } from './infrastructure/providers/channel-provider.factory';
import { KafkaEventPublisher } from './infrastructure/services/kafka-event-publisher';

// Infrastructure — Providers
import { SendGridEmailProvider } from './infrastructure/providers/sendgrid-email.provider';
import { TwilioSmsProvider } from './infrastructure/providers/twilio-sms.provider';
import { FirebasePushProvider } from './infrastructure/providers/firebase-push.provider';
import { InAppProvider } from './infrastructure/providers/in-app.provider';

// Infrastructure — Services
import { RetrySchedulerService } from './infrastructure/services/retry-scheduler.service';
import { DlqProcessorService } from './infrastructure/services/dlq-processor.service';

// Infrastructure — Metrics
import { NotificationMetricsService } from './infrastructure/metrics/notification-metrics.service';

@Module({
  imports: [CqrsModule, KafkaModule],
  controllers: [NotificationController],
  providers: [
    // ── CQRS Handlers ────────────────────────────────────────────
    SendNotificationHandler,
    RetryNotificationHandler,
    MoveToDlqHandler,
    GetNotificationHandler,

    // ── Application Services ─────────────────────────────────────
    NotificationOrchestrator,

    // ── DI Bindings: Symbol → Concrete ───────────────────────────
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

    // ── Channel Providers (injected into factory) ────────────────
    SendGridEmailProvider,
    TwilioSmsProvider,
    FirebasePushProvider,
    InAppProvider,

    // ── Scheduled Services ───────────────────────────────────────
    RetrySchedulerService,
    DlqProcessorService,

    // ── Metrics ──────────────────────────────────────────────────
    NotificationMetricsService,
  ],
})
export class NotificationCoreModule {}
