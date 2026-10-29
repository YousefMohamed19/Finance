import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { AuthUser, CurrentUser, Public } from './common/auth.decorators';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationsService } from './notifications/notifications.service';
import { AuthModule } from './auth/auth.module';
import { JarsModule } from './jars/jars.module';
import { JarsService } from './jars/jars.service';
import { CounterpartiesModule } from './counterparties/counterparties.module';
import { TransactionsModule } from './transactions/transactions.module';
import { EntriesModule } from './entries/entries.module';
import { EntriesService } from './entries/entries.service';
import { RecurringModule } from './recurring/recurring.module';
import { GoalsModule } from './goals/goals.module';
import { InsightsModule } from './insights/insights.module';
import { RemindersModule } from './reminders/reminders.module';
import { TelegramModule } from './telegram/telegram.module';

@Controller()
class AppController {
  constructor(
    private readonly jars: JarsService,
    private readonly entries: EntriesService,
    private readonly notifications: NotificationsService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }

  /** Everything the home screen needs in one call. */
  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthUser) {
    const [overview, drafts, unread] = await Promise.all([
      this.jars.overview(u.userId),
      this.entries.countDrafts(u.userId),
      this.notifications.unreadCount(u.userId),
    ]);
    return { ...overview, total: overview.jars.reduce((s, j) => s + j.balance, 0), pendingDrafts: drafts, unreadNotifications: unread };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGO_URI ?? 'mongodb://localhost:27017/finanse', {
      // Tests boot the app without a database to check wiring, validation and auth.
      lazyConnection: process.env.NODE_ENV === 'test',
    }),
    JwtModule.register({ global: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    DatabaseModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    JarsModule,
    CounterpartiesModule,
    TransactionsModule,
    EntriesModule,
    RecurringModule,
    GoalsModule,
    InsightsModule,
    RemindersModule,
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
