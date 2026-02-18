import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { requireRole } from '../rbac/access';

type FeedbackIn = {
  page: string;
  message: string;
  rating: number;
};

@Controller()
export class FeedbackController {
  @Post('/feedback')
  async submit(@Req() req: Request, @Body() body: FeedbackIn) {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR', 'SUPPLIER');
    const client = pgClientFrom(req);
    const page = String(body.page || '').trim();
    const message = String(body.message || '').trim();
    const rating = Number(body.rating || 0);
    if (!page || !message || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error('Invalid feedback payload');
    }
    const ids = await client.query(`SELECT current_setting('app.user_id', true) AS uid, current_setting('app.tenant_id', true) AS tid`);
    const role = String((req as any).user?.role || req.headers['x-role'] || 'MEMBER').toUpperCase();
    const userRaw = String(ids.rows[0].uid || '');
    const userId = /^[0-9a-fA-F-]{36}$/.test(userRaw) ? userRaw : null;
    await client.query(
      `INSERT INTO esg.feedback(tenant_id, user_id, role, page, message, rating)
       VALUES (app.current_tenant(), $1, $2, $3, $4, $5)`,
      [userId, role, page, message, rating]
    );
    await client.query(`SELECT esg.record_pilot_event(app.current_tenant(), 'feedback', 1)`);
    return { ok: true };
  }

  @Get('/feedback')
  async list(
    @Req() req: Request,
    @Query('limit') limit: string,
    @Query('minRating') minRating: string,
    @Query('pageLike') pageLike: string
  ) {
    requireRole('ADMIN');
    const client = pgClientFrom(req);
    const lim = Math.min(Math.max(Number(limit || 100), 1), 500);
    const min = Number.isFinite(Number(minRating)) ? Math.max(Math.min(Number(minRating), 5), 1) : null;
    const pageFilter = (pageLike || '').trim();
    const r = await client.query(
      `SELECT id, user_id, role, page, message, rating, created_at
         FROM esg.feedback
        WHERE tenant_id = app.current_tenant()
          AND ($2::int IS NULL OR rating >= $2::int)
          AND ($3::text = '' OR page ILIKE ('%' || $3::text || '%'))
        ORDER BY created_at DESC
        LIMIT $1`,
      [lim, min, pageFilter]
    );
    return r.rows.map((x) => ({
      id: x.id,
      userId: x.user_id,
      role: x.role,
      page: x.page,
      message: x.message,
      rating: Number(x.rating),
      createdAt: new Date(x.created_at).toISOString()
    }));
  }
}
