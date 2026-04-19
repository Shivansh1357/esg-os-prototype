import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initErrorTracking, captureException } from './observability/error-tracking';

async function bootstrap() {
  await initErrorTracking();

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? '5051');
  app.enableCors({
    origin: 'http://localhost:5050',
    allowedHeaders: ['content-type', 'authorization', 'x-tenant-id', 'x-user-id', 'x-role', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });

  // Global unhandled error capture
  process.on('unhandledRejection', (reason: any) => {
    captureException(reason instanceof Error ? reason : new Error(String(reason)), { type: 'unhandledRejection' });
  });

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API up on :${port}`);
}
bootstrap();


