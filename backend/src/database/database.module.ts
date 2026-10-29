import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MODELS } from '../schemas';

/** Registers every model once and shares them with all feature modules. */
@Global()
@Module({
  imports: [MongooseModule.forFeature(MODELS)],
  exports: [MongooseModule],
})
export class DatabaseModule {}
