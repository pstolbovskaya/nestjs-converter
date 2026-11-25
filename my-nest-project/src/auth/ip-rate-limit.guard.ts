import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimitResult, RateLimitService } from '../redis/rate-limit.service';

const IP_LIMIT = 30;
const IP_WINDOW_SECONDS = 60;

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimitService: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const key = `rl:ip:${req.path}:${req.ip}`;

    let result: RateLimitResult;
    try {
      result = await this.rateLimitService.hit(key, IP_WINDOW_SECONDS);
    } catch {
      throw new ServiceUnavailableException();
    }

    if (result.count > IP_LIMIT) {
      res.setHeader('Retry-After', String(result.retryAfter));
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
