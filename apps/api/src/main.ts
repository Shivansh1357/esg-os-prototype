import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? '3001');
  app.enableCors({
    origin: 'http://localhost:3000',
    allowedHeaders: ['content-type', 'authorization', 'x-tenant-id', 'x-user-id', 'x-role', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API up on :${port}`);
}
bootstrap();


