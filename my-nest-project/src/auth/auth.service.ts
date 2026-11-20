import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { isUniqueViolation } from '../database/postgres-errors';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { ConfirmRegisterDto } from './dto/confirm-register.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { TokenService } from './token.service';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_CD_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const BCRYPT_COST = 12;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password', BCRYPT_COST);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly hmacSecret: string;
  private readonly emailConfirmationEnabled: boolean;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
  ) {
    const secret = process.env.CONFIRMATION_HMAC_SECRET;
    if (!secret) {
      throw new Error('CONFIRMATION_HMAC_SECRET is not set');
    }
    this.hmacSecret = secret;

    const confirmationFlag = process.env.AUTH_EMAIL_CONFIRMATION;
    if (confirmationFlag !== 'true' && confirmationFlag !== 'false') {
      throw new Error('AUTH_EMAIL_CONFIRMATION must be "true" or "false"');
    }
    this.emailConfirmationEnabled = confirmationFlag === 'true';
  }

  async register(dto: RegisterDto) {
    const email = dto.email;
    const existingUser = await this.usersRepository.findOneBy({ email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const user = this.usersRepository.create({
      email: email,
      password: passwordHash,
    });

    let otp: string | null = null;
    if (this.emailConfirmationEnabled) {
      otp = this.issueOtp(user);
    } else {
      user.isConfirmed = true;
    }

    let savedUser: User;

    try {
      savedUser = await this.usersRepository.save(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('User with this email already exists');
      }

      throw error;
    }

    if (otp) {
      await this.sendOtpEmail(savedUser.email, otp);
    }

    return {
      message: 'User registered',
      id: savedUser.id,
      email: savedUser.email,
      status: savedUser.isConfirmed ? 'active' : 'pending',
    };
  }

  async confirmRegistration(dto: ConfirmRegisterDto) {
    const email = dto.email;
    const user = await this.usersRepository.findOneBy({ email });

    if (
      !user ||
      user.isConfirmed ||
      !user.confirmationCodeHash ||
      !user.confirmationCodeExpireDateTime
    ) {
      throw new BadRequestException('Invalid or expired code');
    }

    if (user.confirmationCodeExpireDateTime < new Date()) {
      throw new BadRequestException('Invalid or expired code');
    }
    if (user.confirmationAttempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many attempts. Please request a new code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isCodeValid = this.isHmacEqual(dto.code, user.confirmationCodeHash);

    if (!isCodeValid) {
      await this.usersRepository.increment(
        { id: user.id },
        'confirmationAttempts',
        1,
      );

      const attemptsUsed = user.confirmationAttempts + 1;
      if (attemptsUsed >= OTP_MAX_ATTEMPTS) {
        throw new HttpException(
          'Too many attempts. Please request a new code',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new BadRequestException('Invalid or expired code');
    }

    user.isConfirmed = true;
    user.confirmationCodeHash = null;
    user.confirmationCodeExpireDateTime = null;
    user.confirmationAttempts = 0;

    await this.usersRepository.save(user);

    return { message: 'Email confirmed' };
  }

  async resendConfirmation(dto: ResendConfirmationDto) {
    const email = dto.email;
    const user = await this.usersRepository.findOneBy({ email });

    if (!user || user.isConfirmed) {
      throw new BadRequestException(
        'User does not exist or has already been confirmed',
      );
    }

    if (user.confirmationCodeExpireDateTime) {
      const sentAt = user.confirmationCodeExpireDateTime.getTime() - OTP_TTL_MS;
      if (Date.now() - sentAt < OTP_RESEND_CD_MS) {
        throw new HttpException(
          'Please wait before requesting a new code',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const otp = this.issueOtp(user);
    await this.usersRepository.save(user);
    await this.sendOtpEmail(user.email, otp);

    return { message: `New code has been sent to ${user.email}` };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepository.findOneBy({ email: dto.email });
    const hasToCheck = user?.password ?? DUMMY_PASSWORD_HASH;
    const isPasswordValid = await bcrypt.compare(dto.password, hasToCheck);

    if (!user || !isPasswordValid || !user.isConfirmed) {
      throw new UnauthorizedException('invalid_credentials');
    }

    return this.tokenService.issueTokens(user);
  }

  private issueOtp(user: User): string {
    const otp = this.generateOtp();
    user.confirmationCodeHash = this.hmac(otp);
    user.confirmationCodeExpireDateTime = new Date(Date.now() + OTP_TTL_MS);
    user.confirmationAttempts = 0;

    return otp;
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.hmacSecret).update(value).digest('hex');
  }

  private isHmacEqual(value: string, expectedHmac: string): boolean {
    const actual = Buffer.from(this.hmac(value), 'hex');
    const expected = Buffer.from(expectedHmac, 'hex');

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
  private async sendOtpEmail(email: string, otp: string): Promise<void> {
    try {
      await this.mailService.sendConfirmationCode(
        email,
        otp,
        OTP_TTL_MS / 60_000,
      );
    } catch (error) {
      this.logger.error(`Failed to send confirmation email to ${email}`, error);

      throw new ServiceUnavailableException(
        'Could not send confirmation email. Please try again later using /auth/register/resend',
      );
    }
  }
}
