import { IsEmail } from 'class-validator';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';

export class ResendConfirmationDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
