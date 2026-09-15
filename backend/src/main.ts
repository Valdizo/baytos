import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Stripe webhooks need the raw body for signature verification
  app.use('/v1/webhooks/payments/stripe', json({ verify: (req: any, _res, buf) => (req.rawBody = buf) }));
  app.use(json());
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT || 4000);
  console.log(`Baytos API running on :${process.env.PORT || 4000}`);
}
bootstrap();
