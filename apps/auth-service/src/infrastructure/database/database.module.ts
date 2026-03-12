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
        username: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "postgres",
        database: process.env.DB_NAME || "eccommerce_auth",
        entities: [UserOrmEntity],
        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV !== "production", // Use migrations in production
      }),
    }),
    TypeOrmModule.forFeature([UserOrmEntity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
