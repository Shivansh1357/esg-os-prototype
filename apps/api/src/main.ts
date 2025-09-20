import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'http://localhost:3000',
    allowedHeaders: ['content-type', 'x-tenant-id', 'x-user-id', 'x-role'],
  });
  await app.listen(3001);
  // eslint-disable-next-line no-console
  console.log('API up on :3001');
}
bootstrap();


