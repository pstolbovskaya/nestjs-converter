import { Request } from 'express';
import { JwtPayload, TokenService } from './token.service';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ACCESS_COOKIE } from './auth-cookies';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthService } from './auth.service';

export interface AuthenticatedRequest extends Request {
  user: User;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token === '') {
      throw new UnauthorizedException();
    }

    const payload = await this.tokenService.verifyToken(token, 'access');

    req.user = await this.authService.findActiveUser(payload.sub);
    return true;
  }
}
