import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserOrmEntity } from "./user.orm-entity";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: "postgres",
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432", 10),
        username: process.env.DB_USER || "ecommerce_user",
        password: process.env.DB_PASSWORD || "ecommerce_password",
        database: process.env.DB_NAME || "ecommerce_db",
        entities: [UserOrmEntity],
        synchronize: process.env.NODE_ENV !== "production", // Use migrations in production
      }),
    }),
    TypeOrmModule.forFeature([UserOrmEntity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
