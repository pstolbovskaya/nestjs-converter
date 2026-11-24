import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ConfirmRegisterDto } from './dto/confirm-register.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { LoginDto } from './dto/login.dto';
import type { Request, Response } from 'express';
import {
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from './auth-cookies';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('register/confirm')
  @HttpCode(HttpStatus.OK)
  confirmRegister(@Body() body: ConfirmRegisterDto) {
    return this.authService.confirmRegistration(body);
  }

  @Post('register/resend')
  @HttpCode(HttpStatus.OK)
  resendRegister(@Body() dto: ResendConfirmationDto) {
    return this.authService.resendConfirmation(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const tokens = await this.authService.login(dto);
    setAuthCookies(res, tokens);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== 'string' || token === '') {
      throw new UnauthorizedException();
    }
    const tokens = await this.authService.refresh(token);
    setAuthCookies(res, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    clearAuthCookies(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return { id: req.user.id, email: req.user.email };
  }
}
