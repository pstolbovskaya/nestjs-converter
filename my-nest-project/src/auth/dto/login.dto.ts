import { IsEmail, IsString } from 'class-validator';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { MaxBytes } from '../../common/decorators/max-bytes.decorator';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MaxBytes(72)
  password: string;
}
