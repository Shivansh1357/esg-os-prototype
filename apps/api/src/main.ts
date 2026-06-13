import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initErrorTracking, captureException } from './observability/error-tracking';

// Validate environment at boot so misconfiguration surfaces immediately rather
// than as an opaque 500 on the first request that needs a secret.
//
// Hard requirements (fatal in production): the API cannot serve any request
// without them. Soft requirements (warn only): individual features degrade if
// missing, but the service still boots — so we never block a deploy on them.
function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const authMode = (process.env.AUTH_MODE || (isProd ? 'jwt' : 'hybrid')).toLowerCase();

  const hardRequired: string[] = ['DATABASE_URL'];
  if (authMode === 'jwt' || isProd) hardRequired.push('JWT_SECRET');

  // Feature-scoped secrets: missing them only breaks supplier/auditor public
  // token signing, so warn rather than crash the whole service.
  const softRequired = ['SUPPLIER_TOKEN_SECRET', 'AUDITOR_TOKEN_SECRET'];

  const missingHard = hardRequired.filter((k) => !process.env[k]);
  const missingSoft = softRequired.filter((k) => !process.env[k]);

  if (missingSoft.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[startup] Missing optional env (related features will be unavailable): ${missingSoft.join(', ')}`,
    );
  }

  if (missingHard.length === 0) return;
  const message = `Missing required environment variables: ${missingHard.join(', ')}`;
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


