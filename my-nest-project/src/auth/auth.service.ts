import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { isUniqueViolation } from '../database/postgres-errors';
import { randomInt } from 'crypto';
import { ConfirmRegisterDto } from './dto/confirm-register.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { MailService } from '../mail/mail.service';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_CD_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existingUser = await this.usersRepository.findOneBy({ email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = this.usersRepository.create({
      email: email,
      password: passwordHash,
    });

    const otp = await this.issueOtp(user);

    let savedUser: User;

    try {
      savedUser = await this.usersRepository.save(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('User with this email already exists');
      }

      throw error;
    }

    await this.sendOtpEmail(savedUser, otp);

    return {
      message: 'User registered',
      id: savedUser.id,
      email: savedUser.email,
    };
  }

  async confirmRegistration(dto: ConfirmRegisterDto) {
    const email = dto.email.toLowerCase();
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

    const isCodeValid = await bcrypt.compare(
      dto.code,
      user.confirmationCodeHash,
    );
    if (!isCodeValid) {
      await this.usersRepository.increment(
        { id: user.id },
        'confirmationAttempts',
        1,
      );
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
    const email = dto.email.toLowerCase();

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

    const otp = await this.issueOtp(user);
    await this.usersRepository.save(user);
    await this.sendOtpEmail(user, otp);

    return { message: `New code has been sent to ${user.email}` };
  }

  private async issueOtp(user: User): Promise<string> {
    const otp = this.generateOtp();
    user.confirmationCodeHash = await bcrypt.hash(otp, 10);
    user.confirmationCodeExpireDateTime = new Date(Date.now() + OTP_TTL_MS);
    user.confirmationAttempts = 0;

    return otp;
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async sendOtpEmail(user: User, otp: string): Promise<void> {
    try {
      await this.mailService.sendConfirmationCode(
        user.email,
        otp,
        OTP_TTL_MS / 60_000,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send confirmation email to ${user.email}`,
        error,
      );

      await this.usersRepository.update(
        { id: user.id },
        { confirmationCodeHash: null, confirmationCodeExpireDateTime: null },
      );

      throw new ServiceUnavailableException(
        'Could not send confirmation email. Please try again later using /auth/register/resend',
      );
    }
  }
}
