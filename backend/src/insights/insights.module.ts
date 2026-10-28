import { Module } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { JarsModule } from '../jars/jars.module';
import { GoalsModule } from '../goals/goals.module';
import { CounterpartiesModule } from '../counterparties/counterparties.module';

@Module({
  imports: [JarsModule, GoalsModule, CounterpartiesModule],
  providers: [InsightsService],
  controllers: [InsightsController],
})
export class InsightsModule {}
