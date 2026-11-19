import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly transporter: Transporter = createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });

  async sendConfirmationCode(
    to: string,
    code: string,
    ttlMinutes: number,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject: 'Confirm your email',
      text: `Your confirmation code: ${code}\nThe code expires in ${ttlMinutes} minutes`,
    });

    this.logger.log(`Confirmation sent to ${to}`);
  }
}
