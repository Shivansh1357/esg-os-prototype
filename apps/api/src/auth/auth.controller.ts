import {
  BadRequestException,
  Body,
  Controller,
  OnModuleDestroy,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Pool } from 'pg';
import * as jwt from 'jsonwebtoken';
import { pgClientFrom } from '../db/reqpg';
import { enforceRateLimit, requireRole } from '../rbac/access';

type LoginIn = { email?: unknown; password?: unknown };
type SetPasswordIn = { userId?: unknown; password?: unknown };

const TOKEN_TTL = process.env.AUTH_TOKEN_TTL || '12h';
const MIN_PASSWORD_LEN = 8;

// Dedicated pool for the public /auth/login route, which runs OUTSIDE the
// tenant middleware (no req.pg) because the tenant is not known until the
// credentials are verified.
let loginPool: Pool | null = null;
function getLoginPool(): Pool {
  if (!loginPool) loginPool = new Pool({ connectionString: process.env.DATABASE_URL });
  return loginPool;
}

@Controller()
export class AuthController implements OnModuleDestroy {
  async onModuleDestroy() {
    if (loginPool) {
      await loginPool.end();
      loginPool = null;
    }
  }

  @Post('/auth/login')
  async login(@Body() body: LoginIn) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      throw new BadRequestException({ code: 'INVALID_CREDENTIALS', message: 'email and password are required' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Misconfiguration, not a client error.
      throw new Error('JWT_SECRET not set');
    }

    const r = await getLoginPool().query(
      `SELECT tenant_id, user_id, role, email FROM auth.verify_login($1, $2)`,
      [email, password],
    );
    // Reject unknown/bad password (0 rows) and ambiguous email collisions (>1).
    if (r.rows.length !== 1) {
      throw new UnauthorizedException({ code: 'INVALID_LOGIN', message: 'Invalid email or password' });
    }
    const u = r.rows[0] as { tenant_id: string; user_id: string; role: string; email: string };

    const token = jwt.sign(
      { tenantId: u.tenant_id, sub: u.user_id, role: u.role, email: u.email },
      secret,
      { algorithm: 'HS256', expiresIn: TOKEN_TTL } as jwt.SignOptions,
    );

    return {
      token,
      user: { tenantId: u.tenant_id, userId: u.user_id, role: u.role, email: u.email },
    };
  }

  @Post('/auth/set-password')
  async setPassword(@Body() body: SetPasswordIn, @Req() req: Request): Promise<{ ok: boolean }> {
    requireRole('ADMIN');
    enforceRateLimit('set_password', 20, 60_000);

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRe.test(userId)) {
      throw new BadRequestException({ code: 'INVALID_USER', message: 'A valid userId is required' });
    }
    if (password.length < MIN_PASSWORD_LEN) {
      throw new BadRequestException({ code: 'WEAK_PASSWORD', message: `Password must be at least ${MIN_PASSWORD_LEN} characters` });
    }

    // Runs inside the tenant transaction; RLS + the WHERE clause confine the
    // update to a user in the caller's own tenant.
    const client = pgClientFrom(req);
    const res = await client.query(
      `UPDATE esg.users
          SET password_hash = crypt($1, gen_salt('bf'))
        WHERE id = $2 AND tenant_id = app.current_tenant()`,
      [password, userId],
    );
    return { ok: (res.rowCount ?? 0) > 0 };
  }
}
