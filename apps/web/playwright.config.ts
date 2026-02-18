import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';

const tenantId = process.env.E2E_TENANT_ID ?? randomUUID();
const userId = process.env.E2E_USER_ID ?? randomUUID();
const jwtSecret = process.env.JWT_SECRET ?? 'test-jwt-secret';
const authToken = jwt.sign({ tenantId, sub: userId, role: 'ADMIN' }, jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
process.env.E2E_TENANT_ID = tenantId;
process.env.E2E_USER_ID = userId;
process.env.NEXT_PUBLIC_TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? tenantId;
process.env.NEXT_PUBLIC_USER_ID = process.env.NEXT_PUBLIC_USER_ID ?? userId;
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.js',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry', testIdAttribute: 'data-test' },
  webServer: [
    {
      command: 'pnpm --filter @apps/api exec puppeteer browsers install chrome && pnpm --filter @apps/api start',
      port: 3001,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os',
        PORT: '3001',
        SUPPLIER_TOKEN_SECRET: process.env.SUPPLIER_TOKEN_SECRET ?? 'supplier-e2e-secret',
        PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000',
        AUTH_MODE: process.env.AUTH_MODE ?? 'jwt',
        JWT_SECRET: jwtSecret,
        E2E_TENANT_ID: tenantId,
        E2E_USER_ID: userId,
      }
    },
    {
      command: 'pnpm --filter @apps/web build && pnpm --filter @apps/web start',
      port: 3000,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
        NEXT_PUBLIC_TENANT_ID: process.env.NEXT_PUBLIC_TENANT_ID ?? tenantId,
        NEXT_PUBLIC_USER_ID: process.env.NEXT_PUBLIC_USER_ID ?? userId,
        NEXT_PUBLIC_AUTH_TOKEN: process.env.NEXT_PUBLIC_AUTH_TOKEN ?? authToken,
        NEXT_PUBLIC_DEFAULT_FACTOR_SET_ID: process.env.NEXT_PUBLIC_DEFAULT_FACTOR_SET_ID ?? '11111111-1111-1111-1111-111111111111',
        NEXT_PUBLIC_FACTOR_SET_LABEL: process.env.NEXT_PUBLIC_FACTOR_SET_LABEL ?? 'Default',
      }
    }
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});


