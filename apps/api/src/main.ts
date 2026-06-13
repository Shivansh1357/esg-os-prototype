import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initErrorTracking, captureException } from './observability/error-tracking';

// Fail fast in production if security-critical secrets are missing, rather than
// crashing later with an opaque runtime error on the first request that needs them.
function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const authMode = (process.env.AUTH_MODE || 'hybrid').toLowerCase();

  const required: string[] = ['DATABASE_URL'];
  if (authMode === 'jwt' || isProd) required.push('JWT_SECRET');
  if (isProd) required.push('SUPPLIER_TOKEN_SECRET', 'AUDITOR_TOKEN_SECRET');

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length === 0) return;

  const message = `Missing required environment variables: ${missing.join(', ')}`;
  if (isProd) throw new Error(message);
  // eslint-disable-next-line no-console
  console.warn(`[startup] ${message} (non-fatal outside production)`);
}

async function bootstrap() {
  validateEnv();
  await initErrorTracking();

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? '5051');
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5050')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
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


