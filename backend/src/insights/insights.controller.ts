import { Controller, Get, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { InsightsService } from './insights.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { monthOf } from '../common/dates';

class MonthQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}$/) month?: string;
}

class MonthsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(36) months?: number;
}

@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('income-by-source')
  income(@CurrentUser() u: AuthUser, @Query() q: MonthsQuery) {
    return this.insights.incomeBySource(u.userId, q.months ?? 12);
  }

  @Get('spending-by-destination')
  spending(@CurrentUser() u: AuthUser, @Query() q: MonthQuery) {
    return this.insights.spendingByDestination(u.userId, q.month ?? monthOf(new Date()));
  }

  @Get('monthly')
  monthly(@CurrentUser() u: AuthUser, @Query() q: MonthQuery) {
    return this.insights.monthlySummary(u.userId, q.month ?? monthOf(new Date()));
  }

  @Get('reports')
  reports(@CurrentUser() u: AuthUser) {
    return this.insights.listReports(u.userId);
  }

  @Post('reports')
  generate(@CurrentUser() u: AuthUser, @Query() q: MonthQuery) {
    return this.insights.generateReport(u.userId, q.month ?? monthOf(new Date()));
  }
}
