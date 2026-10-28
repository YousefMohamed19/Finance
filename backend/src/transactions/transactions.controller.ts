import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { CreateExpenseDto, CreateIncomeDto, CreateTransferDto, ListTransactionsQuery, UpdateTransactionDto } from './transactions.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly txs: TransactionsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: ListTransactionsQuery) {
    return this.txs.list(u.userId, q);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.txs.findOne(u.userId, id);
  }

  @Post('income')
  income(@CurrentUser() u: AuthUser, @Body() dto: CreateIncomeDto) {
    return this.txs.createIncome(u.userId, dto);
  }

  @Post('expense')
  expense(@CurrentUser() u: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.txs.createExpense(u.userId, dto);
  }

  @Post('transfer')
  transfer(@CurrentUser() u: AuthUser, @Body() dto: CreateTransferDto) {
    return this.txs.createTransfer(u.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.txs.update(u.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.txs.remove(u.userId, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.txs.restore(u.userId, id);
  }
}
