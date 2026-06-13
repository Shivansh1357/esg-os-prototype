import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { enforceRateLimit, requireRole } from '../rbac/access';

type EntityType = 'ORG' | 'BU' | 'SITE';
type EntityOut = { id: string; name: string; etype: EntityType; parentId: string | null; createdAt: string };
type CreateEntityIn = { name?: unknown; etype?: unknown; parentId?: unknown };

const ENTITY_TYPES: ReadonlySet<string> = new Set(['ORG', 'BU', 'SITE']);

function mapEntity(row: { id: string; name: string; etype: EntityType; parent_id: string | null; created_at: Date }): EntityOut {
  return {
    id: row.id,
    name: row.name,
    etype: row.etype,
    parentId: row.parent_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

@Controller()
export class EntitiesController {
  @Get('/entities')
  async list(@Req() req: Request): Promise<{ entities: EntityOut[] }> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT id, name, etype, parent_id, created_at
         FROM esg.entities
        WHERE tenant_id = app.current_tenant()
        ORDER BY created_at ASC, name ASC`,
    );
    return { entities: r.rows.map(mapEntity) };
  }

  @Post('/entities')
  async create(@Body() body: CreateEntityIn, @Req() req: Request): Promise<{ entity: EntityOut }> {
    requireRole('ADMIN');
    enforceRateLimit('entity_create', 30, 60_000);

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const etype = typeof body.etype === 'string' ? body.etype.toUpperCase() : '';
    const parentId = typeof body.parentId === 'string' && body.parentId.trim() ? body.parentId.trim() : null;

    if (!name) throw new BadRequestException({ code: 'INVALID_NAME', message: 'name is required' });
    if (!ENTITY_TYPES.has(etype)) {
      throw new BadRequestException({ code: 'INVALID_ETYPE', message: 'etype must be ORG, BU, or SITE' });
    }

    const client = pgClientFrom(req);
    const r = await client.query(
      `INSERT INTO esg.entities (tenant_id, name, etype, parent_id)
       VALUES (app.current_tenant(), $1, $2::esg.entity_type, $3)
       RETURNING id, name, etype, parent_id, created_at`,
      [name, etype, parentId],
    );
    return { entity: mapEntity(r.rows[0]) };
  }
}
