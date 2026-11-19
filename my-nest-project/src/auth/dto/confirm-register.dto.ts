import { IsEmail, Matches } from 'class-validator';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';

export class ConfirmRegisterDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;
}
