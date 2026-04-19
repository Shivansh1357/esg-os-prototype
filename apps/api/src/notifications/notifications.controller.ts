import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { enforceRateLimit, requireRole } from '../rbac/access';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  emailSent: boolean;
  createdAt: string;
};

@Controller()
export class NotificationsController {
  @Get('/notifications')
  async list(
    @Query('unreadOnly') unreadOnly: string,
    @Req() req: Request
  ): Promise<NotificationItem[]> {
    requireRole('ADMIN', 'MEMBER');
    const client = pgClientFrom(req);
    const filter = unreadOnly === 'true' ? 'AND read = false' : '';
    const r = await client.query(
      `SELECT id, type, title, body, link, read, email_sent, created_at
         FROM esg.notifications
        WHERE tenant_id = app.current_tenant() ${filter}
        ORDER BY created_at DESC
        LIMIT 50`
    );
    return r.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link ?? null,
      read: row.read,
      emailSent: row.email_sent,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  @Post('/notifications/:id/read')
  async markRead(@Param('id') id: string, @Req() req: Request) {
    requireRole('ADMIN', 'MEMBER');
    const client = pgClientFrom(req);
    await client.query(
      `UPDATE esg.notifications SET read = true WHERE id = $1 AND tenant_id = app.current_tenant()`,
      [id]
    );
    return { ok: true };
  }

  @Post('/notifications/generate')
  async generate(
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
    @Req() req: Request
  ) {
    requireRole('ADMIN');
    enforceRateLimit('notifications_generate', 5, 60_000);
    const client = pgClientFrom(req);
    const tid = (await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`)).rows[0].tid;
    const approvalCount = await client.query(`SELECT esg.notify_pending_approvals($1, $2, $3) AS cnt`, [tid, periodStart, periodEnd]);
    const gapCount = await client.query(`SELECT esg.notify_compliance_gaps($1, $2, $3) AS cnt`, [tid, periodStart, periodEnd]);
    return {
      generated: {
        approvals: approvalCount.rows[0]?.cnt ?? 0,
        complianceGaps: gapCount.rows[0]?.cnt ?? 0,
      },
    };
  }

  @Get('/notifications/count')
  async unreadCount(@Req() req: Request) {
    requireRole('ADMIN', 'MEMBER');
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT count(*) AS cnt FROM esg.notifications WHERE tenant_id = app.current_tenant() AND read = false`
    );
    return { unread: Number(r.rows[0].cnt ?? 0) };
  }
}
