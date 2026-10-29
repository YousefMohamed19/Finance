import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module';

process.env.JWT_ACCESS_SECRET = 'test-secret';
process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(64);
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/finanse-test';

/** Boots the whole app (without a database) to check module wiring, auth and validation. */
describe('App wiring', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    // There is no database to disconnect from cleanly, so do not wait for it.
    await Promise.race([app?.close(), new Promise((r) => setTimeout(r, 1000))]);
  });

  it('serves the public health check', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200, { ok: true });
  });

  it('protects private routes', async () => {
    await request(app.getHttpServer()).get('/api/jars').expect(401);
    await request(app.getHttpServer()).post('/api/entries/quick').send({ text: 'uber 85' }).expect(401);
  });

  it('validates input before touching the database', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects Telegram webhook calls without the secret', async () => {
    await request(app.getHttpServer()).post('/api/telegram/webhook/wrong').send({}).expect(403);
  });
});
