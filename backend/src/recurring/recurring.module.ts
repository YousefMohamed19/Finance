import { Module } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { RecurringController } from './recurring.controller';
import { JarsModule } from '../jars/jars.module';
import { CounterpartiesModule } from '../counterparties/counterparties.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [JarsModule, CounterpartiesModule, TransactionsModule],
  providers: [RecurringService],
  controllers: [RecurringController],
})
export class RecurringModule {}
