import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { enforceRateLimit, requireRole } from '../rbac/access';

type UserRole = 'ADMIN' | 'MEMBER' | 'AUDITOR';
type UserOut = { id: string; email: string; role: UserRole; status: string; createdAt: string };
type InviteIn = { email?: unknown; role?: unknown };

const USER_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'MEMBER', 'AUDITOR']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapUser(row: { id: string; email: string; role: UserRole; status: string; created_at: Date }): UserOut {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

@Controller()
export class UsersController {
  @Get('/users')
  async list(@Req() req: Request): Promise<{ users: UserOut[] }> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT id, email, role, status, created_at
         FROM esg.users
        WHERE tenant_id = app.current_tenant()
        ORDER BY created_at ASC, email ASC`,
    );
    return { users: r.rows.map(mapUser) };
  }

  @Post('/users/invite')
  async invite(@Body() body: InviteIn, @Req() req: Request): Promise<{ user: UserOut }> {
    requireRole('ADMIN');
    enforceRateLimit('user_invite', 20, 60_000);

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = typeof body.role === 'string' ? body.role.toUpperCase() : '';

    if (!EMAIL_RE.test(email)) throw new BadRequestException({ code: 'INVALID_EMAIL', message: 'A valid email is required' });
    if (!USER_ROLES.has(role)) {
      throw new BadRequestException({ code: 'INVALID_ROLE', message: 'role must be ADMIN, MEMBER, or AUDITOR' });
    }

    const client = pgClientFrom(req);
    const r = await client.query(
      `INSERT INTO esg.users (tenant_id, email, role)
       VALUES (app.current_tenant(), $1, $2)
       ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id, email, role, status, created_at`,
      [email, role],
    );
    return { user: mapUser(r.rows[0]) };
  }
}
