import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TelegramApi } from './telegram.api';

@Global()
@Module({
  providers: [NotificationsService, TelegramApi],
  controllers: [NotificationsController],
  exports: [NotificationsService, TelegramApi],
})
export class NotificationsModule {}
