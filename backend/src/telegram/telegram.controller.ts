import { Body, Controller, ForbiddenException, HttpCode, Param, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { Public } from '../common/auth.decorators';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  /** Webhook mode only. The secret in the path proves the call comes from Telegram (via the URL we registered). */
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @Post('webhook/:secret')
  async webhook(@Param('secret') secret: string, @Body() update: any) {
    const expected = Buffer.from(process.env.TELEGRAM_WEBHOOK_SECRET ?? '');
    const given = Buffer.from(secret);
    if (!expected.length || expected.length !== given.length || !timingSafeEqual(expected, given)) throw new ForbiddenException();
    await this.telegram.handle(update);
    return { ok: true };
  }
}
