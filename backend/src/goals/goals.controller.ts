import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, Max, Min } from 'class-validator';
import { GoalDto, GoalsService, UpdateGoalDto } from './goals.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';

class WhatIfQuery {
  @IsMongoId() from: string;
  @IsMongoId() to: string;
  /** Basis points to move (5% = 500). */
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) percentBp: number;
}

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.goals.withProjections(u.userId);
  }

  @Get('what-if')
  whatIf(@CurrentUser() u: AuthUser, @Query() q: WhatIfQuery) {
    return this.goals.whatIf(u.userId, q.from, q.to, q.percentBp);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: GoalDto) {
    return this.goals.create(u.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.goals.update(u.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.goals.remove(u.userId, id);
  }
}
