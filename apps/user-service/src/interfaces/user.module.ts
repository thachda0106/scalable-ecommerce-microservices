import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Domain Ports
import { USER_REPOSITORY } from '../domain/ports/user-repository.port';

// Application Ports
import { EVENT_PUBLISHER } from '../application/ports/event-publisher.port';

// Application Handlers
import {
  CreateUserHandler,
  UpdateUserHandler,
  DeleteUserHandler,
  UpdateUserProfileHandler,
  UpdateUserSettingsHandler,
  SuspendUserHandler,
  ReactivateUserHandler,
  GetUserByIdHandler,
  GetUserByEmailHandler,
  GetUserByUsernameHandler,
  GetUsersHandler,
} from '../application/handlers';

// Infrastructure — Persistence
import { UserOrmEntity } from '../infrastructure/persistence/entities/user.orm-entity';
import { UserProfileOrmEntity } from '../infrastructure/persistence/entities/user-profile.orm-entity';
import { UserSettingsOrmEntity } from '../infrastructure/persistence/entities/user-settings.orm-entity';
import { OutboxEventOrmEntity } from '../infrastructure/persistence/entities/outbox-event.orm-entity';
import { TypeOrmUserRepository } from '../infrastructure/persistence/repositories/typeorm-user.repository';

// Infrastructure — Kafka
import { KafkaClientFactory } from '../infrastructure/kafka/kafka-client.factory';
import { KafkaEventPublisher } from '../infrastructure/kafka/kafka-event-publisher';
import { OutboxRelayService } from '../infrastructure/kafka/outbox-relay.service';

// Infrastructure — Observability
import { UserMetricsService, MetricsController, AuditLogService } from '../infrastructure/observability';

// Interface Layer
import { UserController } from './controllers/user.controller';
import { HealthController } from './controllers/health.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserOrmEntity,
      UserProfileOrmEntity,
      UserSettingsOrmEntity,
      OutboxEventOrmEntity,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    UserController,
    HealthController,
    MetricsController,
  ],
  providers: [
    // Shared Kafka client
    KafkaClientFactory,

    // Port bindings
    {
      provide: USER_REPOSITORY,
      useClass: TypeOrmUserRepository,
    },
    {
      provide: EVENT_PUBLISHER,
      useClass: KafkaEventPublisher,
    },

    // Command Handlers
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,
    UpdateUserProfileHandler,
    UpdateUserSettingsHandler,
    SuspendUserHandler,
    ReactivateUserHandler,

    // Query Handlers
    GetUserByIdHandler,
    GetUserByEmailHandler,
    GetUserByUsernameHandler,
    GetUsersHandler,

    // Kafka Infrastructure
    OutboxRelayService,

    // Observability
    UserMetricsService,
    AuditLogService,
  ],
})
export class UserModule {}
