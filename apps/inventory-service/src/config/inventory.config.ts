import { registerAs } from '@nestjs/config';

export const inventoryConfig = registerAs('inventory', () => ({
  reservationTtlMinutes: parseInt(
    process.env.RESERVATION_TTL_MINUTES || '15',
  ),
  lowStockThreshold: parseInt(process.env.LOW_STOCK_THRESHOLD || '100'),
  maxReserveItems: parseInt(process.env.MAX_RESERVE_ITEMS || '50'),
  expiryWorkerIntervalSeconds: parseInt(
    process.env.EXPIRY_WORKER_INTERVAL || '10',
  ),
  expiryWorkerBatchSize: parseInt(
    process.env.EXPIRY_WORKER_BATCH_SIZE || '100',
  ),
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  lockTtlMs: parseInt(process.env.REDIS_LOCK_TTL_MS || '5000'),
  cacheTtlSeconds: parseInt(process.env.REDIS_CACHE_TTL_SECONDS || '10'),
}));

export const kafkaConfig = registerAs('kafka', () => ({
  brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  clientId: process.env.KAFKA_CLIENT_ID || 'inventory-service',
  consumerGroupId:
    process.env.KAFKA_CONSUMER_GROUP || 'inventory-service-group',
}));

export const databaseConfig = registerAs('database', () => ({
  url:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/inventory',
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  poolMin: parseInt(process.env.DB_POOL_MIN || '5'),
  poolMax: parseInt(process.env.DB_POOL_MAX || '20'),
}));
