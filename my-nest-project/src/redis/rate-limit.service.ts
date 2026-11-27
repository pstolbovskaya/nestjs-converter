import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis, { ChainableCommander } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export interface RateLimitResult {
  count: number;
  retryAfter: number;
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async hit(key: string, windowSeconds: number): Promise<RateLimitResult> {
    const [count, , ttl] = await this.exec(
      this.redis.multi().incr(key).expire(key, windowSeconds, 'NX').ttl(key),
    );
    return { count: count as number, retryAfter: ttl as number };
  }

  async peek(key: string): Promise<RateLimitResult> {
    const [value, ttl] = await this.exec(this.redis.multi().get(key).ttl(key));
    return { count: Number(value ?? 0), retryAfter: ttl as number };
  }

  async reset(key: string): Promise<void> {
    await this.exec(this.redis.multi().del(key));
  }

  private async exec(transaction: ChainableCommander): Promise<unknown[]> {
    let results: [Error | null, unknown][] | null;
    try {
      results = await transaction.exec();
    } catch {
      throw new ServiceUnavailableException();
    }

    if (!results) {
      throw new ServiceUnavailableException();
    }

    return results.map(([error, value]) => {
      if (error) {
        throw new ServiceUnavailableException();
      }

      return value;
    });
  }
}
