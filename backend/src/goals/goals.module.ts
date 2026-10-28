import { Module } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { FlowsService } from './flows.service';
import { JarsModule } from '../jars/jars.module';

@Module({
  imports: [JarsModule],
  providers: [GoalsService, FlowsService],
  controllers: [GoalsController],
  exports: [GoalsService, FlowsService],
})
export class GoalsModule {}
