import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_CD_MS = 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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

    this.logger.log(`OTP for ${savedUser.email}: ${otp}`);
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

    const isCodeValid = await bcrypt.compare(
      dto.code,
      user.confirmationCodeHash,
    );
    if (!isCodeValid) {
      throw new BadRequestException('Invalid or expired code');
    }

    user.isConfirmed = true;
    user.confirmationCodeHash = null;
    user.confirmationCodeExpireDateTime = null;
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

    this.logger.log(`OTP for ${user.email}: ${otp}`);

    return { message: `New code has been sent to ${user.email}` };
  }

  private async issueOtp(user: User): Promise<string> {
    const otp = this.generateOtp();
    user.confirmationCodeHash = await bcrypt.hash(otp, 10);
    user.confirmationCodeExpireDateTime = new Date(Date.now() + OTP_TTL_MS);

    return otp;
  }
  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
