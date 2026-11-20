import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export type TokenUse = 'access' | 'refresh';

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
