import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export type TokenUse = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  token_use: TokenUse;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

@Injectable()
export class TokenService {
  private readonly accessSecret = requireEnv('JWT_ACCESS_SECRET');
  private readonly refreshSecret = requireEnv('JWT_REFRESH_SECRET');
  private readonly audience = requireEnv('JWT_AUDIENCE');
  private readonly issuer = requireEnv('JWT_ISSUER');

  constructor(private readonly jwtService: JwtService) {}

  async issueTokens(user: User) {
    const [accessToken, refreshToken] = await Promise.all([
      this.sign(user, 'access'),
      this.sign(user, 'refresh'),
    ]);

    return { accessToken, refreshToken };
  }

  async verifyToken(token: string, tokenUse: TokenUse): Promise<JwtPayload> {
    const isAccess = tokenUse === 'access';

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: isAccess ? this.accessSecret : this.refreshSecret,
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.token_use !== tokenUse) {
      throw new UnauthorizedException();
    }

    return payload;
  }

  private sign(user: User, tokenUse: TokenUse) {
    const isAccess = tokenUse === 'access';

    return this.jwtService.signAsync(
      { token_use: tokenUse },
      {
        secret: isAccess ? this.accessSecret : this.refreshSecret,
        expiresIn: isAccess ? ACCESS_TTL_SEC : REFRESH_TTL_SEC,
        subject: String(user.id),
        issuer: this.issuer,
        audience: this.audience,
        algorithm: 'HS256',
      },
    );
  }
}
