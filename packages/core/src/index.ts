// Observability
export * from './observability/tracing';
export * from './observability/logging';
export * from './observability/metrics';
export { Logger } from 'nestjs-pino';

// Persistence
export { UnitOfWork } from './persistence/unit-of-work';
export type { IDomainEvent } from './persistence/unit-of-work';
export { OutboxEventEntity } from './persistence/outbox-event.entity';

// Security
export { signInternalHeaders, verifyInternalHeaders } from './security/internal-auth';
export { InternalAuthGuard } from './security/internal-auth.guard';

// Kafka
export { KafkaDlqProducer } from './kafka/dlq-producer';
export type { KafkaMessage, KafkaProducer } from './kafka/dlq-producer';
export { getCorrelationId, setCorrelationHeaders } from './kafka/correlation';
