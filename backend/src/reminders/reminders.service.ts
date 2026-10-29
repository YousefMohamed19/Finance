import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { User } from '../schemas';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { nowInZone } from '../common/dates';
import { toIsoDate } from '../domain/parser';

/** The evening "Anything spent today?" nudge. If yesterday was skipped too, it asks about both days. */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly txs: TransactionsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async run(at = new Date()) {
    const users = await this.users.find({ remindersEnabled: true }).select('timezone reminderHour lastReminderDate');
    for (const user of users) {
      try {
        const local = nowInZone(user.timezone, at);
        const today = toIsoDate(local);
        if (local.getHours() !== user.reminderHour || user.lastReminderDate === today) continue;
        const userId = String(user._id);
        const yesterdayDate = new Date(local);
        yesterdayDate.setDate(local.getDate() - 1);
        const yesterday = toIsoDate(yesterdayDate);
        const [todayCount, yesterdayCount] = await Promise.all([this.txs.countOnDate(userId, today), this.txs.countOnDate(userId, yesterday)]);
        if (todayCount === 0) {
          const message =
            yesterdayCount === 0
              ? '🫙 Anything spent today or yesterday? Reply like "uber 85" or "lunch 150 yesterday".'
              : '🫙 Anything spent today? Reply like "uber 85" or "got 5000 from Ahmed".';
          await this.notifications.notify(userId, 'daily-reminder', message);
        }
        user.lastReminderDate = today;
        await user.save();
      } catch (e) {
        this.logger.error(`Reminder for ${user._id} failed: ${(e as Error).message}`);
      }
    }
  }
}
