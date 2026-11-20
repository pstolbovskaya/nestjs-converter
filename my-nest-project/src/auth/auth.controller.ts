import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ConfirmRegisterDto } from './dto/confirm-register.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { setAuthCookies } from './auth-cookies';

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
}
