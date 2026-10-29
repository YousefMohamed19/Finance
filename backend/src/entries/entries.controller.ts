import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { EntriesService } from './entries.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';

class QuickAddDto {
  @IsString() @Length(1, 1000) text: string;
}

class ConfirmDraftDto {
  @IsOptional() @IsIn(['income', 'expense']) type?: 'income' | 'expense';
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @IsOptional() @IsString() @Length(1, 40) jarKey?: string;
  @IsOptional() @IsString() @Length(1, 80) counterparty?: string;
  @IsOptional() @IsDateString() date?: string;
}

@Controller()
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  /** Preview what a line would become, without saving. */
  @Post('entries/parse')
  parse(@CurrentUser() u: AuthUser, @Body() dto: QuickAddDto) {
    return this.entries.parse(u.userId, dto.text);
  }

  /** "uber 85", "got 5000 from freelance client Ahmed"... */
  @Post('entries/quick')
  quick(@CurrentUser() u: AuthUser, @Body() dto: QuickAddDto) {
    return this.entries.quickAdd(u.userId, dto.text, 'quick');
  }

  /** Paste a bank SMS/notification; it always becomes a draft to confirm. */
  @Post('entries/bank-message')
  bank(@CurrentUser() u: AuthUser, @Body() dto: QuickAddDto) {
    return this.entries.quickAdd(u.userId, dto.text, 'bank');
  }

  @Get('drafts')
  drafts(@CurrentUser() u: AuthUser) {
    return this.entries.listDrafts(u.userId);
  }

  @Post('drafts/:id/confirm')
  confirm(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ConfirmDraftDto) {
    return this.entries.confirm(u.userId, id, dto);
  }

  @Delete('drafts/:id')
  discard(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.entries.discard(u.userId, id);
  }
}
