import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('limit') limit?: string) {
    return this.audit.list(u.userId, limit ? Number(limit) : 100);
  }
}
