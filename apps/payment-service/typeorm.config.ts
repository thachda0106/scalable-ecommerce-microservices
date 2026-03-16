import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

export default new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/payment_db',
  entities: ['src/**/*.orm-entity.ts'],
  migrations: ['src/infrastructure/persistence/migrations/*.ts'],
  synchronize: false,
});
