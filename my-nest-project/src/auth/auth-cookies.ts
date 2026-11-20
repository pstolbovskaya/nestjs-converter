import { CookieOptions, Response } from 'express';
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from './token.service';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
};

const accessOptions: CookieOptions = { ...baseOptions, path: '/' };
const refreshOptions: CookieOptions = { ...baseOptions, path: '/auth/refresh' };

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...accessOptions,
    maxAge: ACCESS_TTL_SEC * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...refreshOptions,
    maxAge: REFRESH_TTL_SEC * 1000,
  });
}
