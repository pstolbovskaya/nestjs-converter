import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export interface RateLimitResult {
  count: number;
  retryAfter: number;
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async hit(key: string, windowSeconds: number): Promise<RateLimitResult> {
    const results = await this.redis
      .multi()
      .incr(key)
      .expire(key, windowSeconds, 'NX')
      .ttl(key)
      .exec();

    if (!results) {
      throw new Error('Redis transaction failed');
    }
    for (const [err] of results) {
      if (err) {
        throw err;
      }
    }
    return {
      count: results[0][1] as number,
      retryAfter: results[2][1] as number,
    };
  }
}
