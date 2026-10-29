import 'reflect-metadata';
import { config } from 'dotenv';
config();
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { encrypt } from './common/crypto';

function checkEnv() {
  for (const name of ['JWT_ACCESS_SECRET', 'FIELD_ENCRYPTION_KEY']) {
    if (!process.env[name] || process.env[name]!.startsWith('change-me')) throw new Error(`Set ${name} in backend/.env`);
  }
  if (/^0+$/.test(process.env.FIELD_ENCRYPTION_KEY!) && process.env.NODE_ENV === 'production') {
    throw new Error('FIELD_ENCRYPTION_KEY is the example value; generate a real key with: openssl rand -hex 32');
  }
  encrypt('self-test'); // fails fast on a malformed key
}

async function bootstrap() {
  checkEnv();
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','), credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap');
}
void bootstrap();
