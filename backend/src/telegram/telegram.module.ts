import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { EntriesModule } from '../entries/entries.module';
import { JarsModule } from '../jars/jars.module';

@Module({ imports: [EntriesModule, JarsModule], providers: [TelegramService], controllers: [TelegramController] })
export class TelegramModule {}
