import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { JarsModule } from '../jars/jars.module';
import { CounterpartiesModule } from '../counterparties/counterparties.module';

@Module({
  imports: [JarsModule, CounterpartiesModule],
  providers: [TransactionsService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
