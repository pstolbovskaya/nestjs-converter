import { IsEmail, IsString, Matches, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { MaxBytes } from '../../common/decorators/max-bytes.decorator';

export class RegisterDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxBytes(72)
  @Matches(/\p{L}/u, { message: 'password must contain at least one letter' })
  @Matches(/\d/, { message: 'password must contain at least one digit' })
  password: string;
}
