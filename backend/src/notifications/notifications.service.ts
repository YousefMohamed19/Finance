import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument, User } from '../schemas';
import { TelegramApi } from './telegram.api';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly model: Model<Notification>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly telegram: TelegramApi,
  ) {}

  /** Stores an in-app notification and, if the user linked Telegram, also sends it there. */
  async notify(userId: string, kind: NotificationDocument['kind'], message: string) {
    const doc = await this.model.create({ user: new Types.ObjectId(userId), kind, message });
    const user = await this.users.findById(userId);
    if (user?.telegramChatId) await this.telegram.sendMessage(user.telegramChatId, message);
    return doc;
  }

  list(userId: string) {
    return this.model.find({ user: userId }).sort({ createdAt: -1 }).limit(50).lean();
  }

  unreadCount(userId: string) {
    return this.model.countDocuments({ user: userId, read: false });
  }

  async markAllRead(userId: string) {
    await this.model.updateMany({ user: userId, read: false }, { read: true });
    return { ok: true };
  }
}
