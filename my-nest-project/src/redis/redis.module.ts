import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { RateLimitService } from './rate-limit.service';
import { REDIS_CLIENT } from './redis.constants';

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const url = process.env.REDIS_URL;
        if (!url) {
          throw new Error('REDIS_URL is not set');
        }
        return new Redis(url, { maxRetriesPerRequest: 1 });
      },
    },
    RateLimitService,
  ],
  exports: [REDIS_CLIENT, RateLimitService],
})
export class RedisModule {}
