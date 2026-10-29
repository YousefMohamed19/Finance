import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JarsModule } from '../jars/jars.module';

@Module({ imports: [JarsModule], providers: [AuthService], controllers: [AuthController] })
export class AuthModule {}
