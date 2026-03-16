import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { UserOrmEntity } from '../persistence/entities/user.orm-entity';
import { UserProfileOrmEntity } from '../persistence/entities/user-profile.orm-entity';
import { UserSettingsOrmEntity } from '../persistence/entities/user-settings.orm-entity';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'user_service',
  entities: [
    UserOrmEntity,
    UserProfileOrmEntity,
    UserSettingsOrmEntity,
    OutboxEventOrmEntity,
  ],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
});
