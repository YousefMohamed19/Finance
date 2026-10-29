import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({ imports: [TransactionsModule], providers: [RemindersService] })
export class RemindersModule {}
