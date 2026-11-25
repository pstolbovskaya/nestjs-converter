import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

const CSRF_HEADER = 'x-csrf-protection';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method !== 'POST') {
      return true;
    }
    if (req.headers[CSRF_HEADER] !== '1') {
      throw new ForbiddenException('Missing CSRF protection header');
    }

    return true;
  }
}
