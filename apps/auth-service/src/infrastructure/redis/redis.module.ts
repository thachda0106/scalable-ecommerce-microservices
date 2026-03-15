import { Module, Global, OnModuleDestroy, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { TokenStoreService, REDIS_CLIENT } from './token-store.service';
import { LoginAttemptStore } from './login-attempt.store';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        });
      },
    },
    TokenStoreService,
    LoginAttemptStore,
  ],
  exports: [REDIS_CLIENT, TokenStoreService, LoginAttemptStore],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
