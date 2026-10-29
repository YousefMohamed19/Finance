import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal client for the Telegram Bot API (free, no credits). Disabled when TELEGRAM_BOT_TOKEN is empty.
 */
@Injectable()
export class TelegramApi {
  private readonly logger = new Logger(TelegramApi.name);

  get enabled(): boolean {
    return !!process.env.TELEGRAM_BOT_TOKEN;
  }

  async call<T = unknown>(method: string, body: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = (await res.json()) as { ok: boolean; result: T; description?: string };
      if (!json.ok) {
        this.logger.warn(`Telegram ${method} failed: ${json.description}`);
        return null;
      }
      return json.result;
    } catch (e) {
      this.logger.warn(`Telegram ${method} error: ${(e as Error).message}`);
      return null;
    }
  }

  sendMessage(chatId: string, text: string) {
    return this.call('sendMessage', { chat_id: chatId, text });
  }
}
