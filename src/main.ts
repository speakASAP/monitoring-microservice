import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: process.env.CORS_ORIGIN || '*' });
  const port = parseInt(process.env.PORT || '3395', 10);
  await app.listen(port);
  console.log(`monitoring-microservice running on port ${port}`);
}
bootstrap();
