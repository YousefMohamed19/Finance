import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RecurringRuleDto, RecurringService, UpdateRecurringRuleDto } from './recurring.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';

@Controller('recurring')
export class RecurringController {
  constructor(private readonly service: RecurringService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.service.list(u.userId);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: RecurringRuleDto) {
    return this.service.create(u.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateRecurringRuleDto) {
    return this.service.update(u.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.remove(u.userId, id);
  }
}
