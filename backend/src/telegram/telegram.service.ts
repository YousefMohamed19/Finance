import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { User } from '../schemas';
import { TelegramApi } from '../notifications/telegram.api';
import { EntriesService } from '../entries/entries.service';
import { JarsService } from '../jars/jars.service';
import { blindIndex } from '../common/crypto';

interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number; type: string }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
}

const money = (minor: number) => (minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const HELP = [
  'Send one line and I will log it:',
  '• uber 85',
  '• lunch 150 yesterday #fun',
  '• got 5000 from freelance client Ahmed',
  '',
  'Commands:',
  '/balance – jar balances',
  '/bank <message> – paste a bank SMS (saved as a draft)',
  '/drafts – entries waiting for confirmation',
].join('\n');

/**
 * Optional Telegram bot (the Bot API is free). Only chats linked with a one-time code are accepted.
 * Uses long polling by default, so it works without a public URL; set TELEGRAM_WEBHOOK_URL to use a webhook.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private polling = false;

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly api: TelegramApi,
    private readonly entries: EntriesService,
    private readonly jars: JarsService,
  ) {}

  async onApplicationBootstrap() {
    if (!this.api.enabled) return;
    const webhook = process.env.TELEGRAM_WEBHOOK_URL;
    if (webhook) {
      await this.api.call('setWebhook', { url: `${webhook.replace(/\/$/, '')}/api/telegram/webhook/${process.env.TELEGRAM_WEBHOOK_SECRET}` });
      this.logger.log('Telegram webhook registered');
    } else {
      await this.api.call('deleteWebhook');
      this.polling = true;
      void this.poll();
      this.logger.log('Telegram bot polling started');
    }
  }

  onApplicationShutdown() {
    this.polling = false;
  }

  private async poll() {
    let offset = 0;
    while (this.polling) {
      const updates = await this.api.call<TgUpdate[]>('getUpdates', { offset, timeout: 25 }, 35000);
      if (!updates) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      for (const u of updates) {
        offset = u.update_id + 1;
        await this.handle(u).catch((e) => this.logger.error(`Telegram update failed: ${(e as Error).message}`));
      }
    }
  }

  private findUserByChat(chatId: number) {
    return this.users.findOne({ telegramChatIdHash: blindIndex(String(chatId)) });
  }

  async handle(update: TgUpdate) {
    if (update.callback_query) return this.handleCallback(update.callback_query);
    const msg = update.message;
    if (!msg?.text || msg.chat.type !== 'private') return;
    const chatId = String(msg.chat.id);
    const text = msg.text.trim();

    const link = /^\/link\s+(\d{6})$/.exec(text);
    if (link) return this.link(chatId, link[1]);

    const user = await this.findUserByChat(msg.chat.id);
    if (!user) {
      await this.api.sendMessage(chatId, 'This chat is not linked. In the app open Settings → Telegram, get a code and send: /link 123456');
      return;
    }
    const userId = String(user._id);
    if (text === '/start' || text === '/help') return this.api.sendMessage(chatId, HELP);
    if (text === '/balance') return this.api.sendMessage(chatId, await this.balanceText(userId));
    if (text === '/drafts') {
      const drafts = await this.entries.listDrafts(userId);
      if (!drafts.length) return this.api.sendMessage(chatId, 'No drafts waiting. 🎉');
      for (const d of drafts.slice(0, 5)) await this.sendDraft(chatId, d);
      return;
    }
    const bank = /^\/bank\s+([\s\S]+)$/.exec(text);
    const result = await this.entries.quickAdd(userId, bank ? bank[1] : text, bank ? 'bank' : 'telegram');
    if (result.status === 'saved') {
      const t = result.transaction as any;
      const where = t.type === 'income' ? 'split across your jars' : `from ${(await this.jars.findOne(userId, String(t.jar))).name}`;
      const who = t.counterparty?.name ? ` (${t.counterparty.name})` : '';
      await this.api.sendMessage(chatId, `✅ ${t.type === 'income' ? 'Income' : 'Expense'} ${money(t.amount)}${who} ${where}.`);
    } else {
      await this.sendDraft(chatId, result.draft);
    }
  }

  private async sendDraft(chatId: string, d: any) {
    const jars = await this.jars.findAll(String(d.user));
    const summary = d.amount
      ? `${d.type === 'income' ? 'Income' : 'Expense'} ${money(d.amount)}${d.counterparty ? ` – ${d.counterparty}` : ''} on ${d.date}`
      : `"${d.raw}"`;
    const keyboard: { text: string; callback_data: string }[][] = [];
    if (d.amount && d.type === 'expense') {
      // Pick the jar with one tap.
      const buttons = jars.map((j) => ({ text: `${j.icon} ${j.name}${j.key === d.jarKey ? ' ✓' : ''}`, callback_data: `j:${d._id}:${j.key}` }));
      for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2));
    } else if (d.amount) {
      keyboard.push([{ text: '✅ Confirm', callback_data: `c:${d._id}` }]);
    }
    keyboard.push([{ text: '🗑 Discard', callback_data: `d:${d._id}` }]);
    const hint = d.amount ? (d.type === 'expense' ? 'Which jar?' : 'Confirm?') : 'I could not find an amount. Discard it and send again, e.g. "uber 85".';
    await this.api.call('sendMessage', { chat_id: chatId, text: `📝 Draft: ${summary}\n${hint}`, reply_markup: { inline_keyboard: keyboard } });
  }

  private async handleCallback(q: NonNullable<TgUpdate['callback_query']>) {
    const chatId = q.message?.chat.id;
    if (!chatId || !q.data) return;
    const user = await this.findUserByChat(chatId);
    if (!user) return this.api.call('answerCallbackQuery', { callback_query_id: q.id, text: 'Chat not linked' });
    const userId = String(user._id);
    const [action, draftId, jarKey] = q.data.split(':');
    let text: string;
    try {
      if (action === 'd') {
        await this.entries.discard(userId, draftId);
        text = '🗑 Discarded.';
      } else {
        const t: any = await this.entries.confirm(userId, draftId, action === 'j' ? { jarKey } : {});
        text = `✅ Saved ${money(t.amount)}${t.counterparty?.name ? ` (${t.counterparty.name})` : ''}.`;
      }
    } catch (e) {
      text = `⚠️ ${(e as Error).message}`;
    }
    await this.api.call('answerCallbackQuery', { callback_query_id: q.id });
    await this.api.call('editMessageText', { chat_id: chatId, message_id: q.message!.message_id, text });
  }

  private async link(chatId: string, code: string) {
    const user = await this.users.findOne({ telegramLinkCode: sha256(code), telegramLinkExpires: { $gt: new Date() } });
    if (!user) return this.api.sendMessage(chatId, '❌ That code is wrong or expired. Get a new one in the app.');
    user.telegramChatId = chatId;
    user.telegramChatIdHash = blindIndex(chatId);
    user.telegramLinkCode = undefined;
    user.telegramLinkExpires = undefined;
    await user.save();
    await this.api.sendMessage(chatId, `🔗 Linked! ${HELP}`);
  }

  private async balanceText(userId: string) {
    const { jars } = await this.jars.overview(userId);
    return jars.map((j) => `${j.icon} ${j.name}: ${money(j.balance)}`).join('\n');
  }
}
