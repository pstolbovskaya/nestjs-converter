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

export interface AuthenticatedRequest extends Request {
  user: User;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token === '') {
      throw new UnauthorizedException();
    }

    const payload = await this.tokenService.verifyToken(token, 'access');

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException();
    }

    let user: User | null;
    try {
      user = await this.userRepository.findOneBy({ id: userId });
    } catch {
      throw new ServiceUnavailableException();
    }

    if (!user || !user.isConfirmed) {
      throw new UnauthorizedException();
    }

    req.user = user;
    return true;
  }
}
