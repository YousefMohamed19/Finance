import { Module } from '@nestjs/common';
import { EntriesService } from './entries.service';
import { EntriesController } from './entries.controller';
import { JarsModule } from '../jars/jars.module';
import { CounterpartiesModule } from '../counterparties/counterparties.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [JarsModule, CounterpartiesModule, TransactionsModule],
  providers: [EntriesService],
  controllers: [EntriesController],
  exports: [EntriesService],
})
export class EntriesModule {}
