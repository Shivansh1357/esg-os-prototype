# Pilot Runbook

Last updated: 2026-02-17

## 1) Provision pilot tenant

```bash
pnpm provision:tenant -- --name="Company A" --role=admin,member,auditor
```

Outputs:
- `tenantId`
- `reportId`
- `admin.jwt`
- optional preset users (`member`, `auditor`)

Use `Authorization: Bearer <admin.jwt>` for API/UI session setup.

## 2) Seed a full demo tenant (fast demo mode)

```bash
pnpm seed:pilot-demo
```

This creates:
- demo tenant + admin user
- current-quarter report
- approved facts
- supplier invites/responses
- compliance findings
- frozen report + populated exec KPIs

## 3) Runtime health checks

```bash
curl -i http://localhost:3001/health
curl -i http://localhost:3001/metrics
curl -i http://localhost:3000/
```

## 4) Backup example (Postgres)

```bash
pg_dump "postgres://postgres:esg@localhost:5432/esg-os" > pilot-backup.sql
```

Restore:

```bash
psql "postgres://postgres:esg@localhost:5432/esg-os" < pilot-backup.sql
```

## 5) Escalation placeholders

- Product owner: `<name/email>`
- Engineering on-call: `<name/email>`
- Security contact: `<name/email>`

## 6) Pilot success checks

- First fact created (`pilot_metrics.first_fact_at` not null)
- First approval completed (`pilot_metrics.first_approval_at` not null)
- First freeze completed (`pilot_metrics.first_freeze_at` not null)
- First exec view captured (`pilot_metrics.first_exec_view_at` not null)
- Supplier invite count > 0
- Feedback count > 0
