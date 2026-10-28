import { Controller, Get, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.service.list(u.userId);
  }

  @Post('read')
  read(@CurrentUser() u: AuthUser) {
    return this.service.markAllRead(u.userId);
  }
}
