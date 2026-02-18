# Run Book

Last updated: 2026-02-17

This is the operator/developer run book for running, debugging, and recovering ESG OS.

## Local Dev Quickstart

Use repository-root commands from `c:/Users/ShivanshTripathi/Projects/esg-os-prototype`.

Important shell note:
- In Git Bash: use `pnpm ...` (not `pnpm.cmd ...`, not PowerShell `$env:...` syntax).
- In PowerShell/CMD: `pnpm ...` is also fine if `pnpm` is on PATH.
- If PowerShell blocks `pnpm` (`PSSecurityException`), use `pnpm.cmd ...` instead.

## Auth Modes

API auth behavior is controlled by `AUTH_MODE`:
- `header`: legacy header-only mode (`x-tenant-id`, `x-user-id`, `x-role`).
- `hybrid`: accepts JWT first, falls back to legacy headers.
- `jwt`: strict Bearer JWT only (recommended for CI/prod).

Required JWT env in `jwt`/`hybrid` mode:
```bash
JWT_SECRET=<your-shared-secret>
```

### 1) Prerequisites check
```bash
pnpm prereq:check
```

### 2) Install deps
```bash
pnpm install
```

### 3) Infra + DB migrations
```bash
pnpm infra:up
pnpm db:deploy
pnpm db:verify
```

### 4) Run services (from root)
API (dev):
```bash
pnpm dev:api
```
Default port: `3001`

Web (dev):
```bash
pnpm dev:web
```
Default port: `3000`

Run both API+Web in one terminal:
```bash
pnpm dev
```

Port mapping in dev stack:
- API: `3001`
- Web: `3000`

Web production-mode run:
```bash
pnpm web:build
pnpm web:start
```

AI service:
```bash
cd apps/ai
python -m venv .venv
source .venv/Scripts/activate  # Git Bash on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Worker:
```bash
pnpm worker:run
```

### 5) Pilot tenant utilities

Provision tenant + role presets:
```bash
pnpm provision:tenant -- --name="Company A" --role=admin,member,auditor
```

Spin up demo tenant in under 2 minutes:
```bash
pnpm seed:pilot-demo
```

Pilot execution references:
- `PILOT_RUNBOOK.md`
- `PILOT_VALIDATION_PACK.md`

## Test Suites

API tests:
```bash
pnpm test:api
```

Web E2E tests:
```bash
pnpm test:web:e2e
```

Strict JWT API tests:
```bash
pnpm test:api:jwt
```

Strict JWT web E2E:
```bash
pnpm test:web:e2e:jwt
```

All workspace tests:
```bash
pnpm test:all
```

## Deploy Smoke (Local)

Run the same compose smoke stack used by CI:
```bash
docker compose -f docker/compose.smoke.yml up --build -d
```

Smoke-check endpoints:
```bash
curl -i http://localhost:3001/health
curl -i http://localhost:3001/metrics
curl -i http://localhost:3000/
```

Auth smoke check (`401` without token, `200` with JWT):
```bash
curl -i http://localhost:3001/reports
token=$(node -e "const crypto=require('crypto');const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=enc({alg:'HS256',typ:'JWT'});const p=enc({tenantId:'11111111-1111-1111-1111-111111111111',sub:'22222222-2222-2222-2222-222222222222',role:'ADMIN',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});const d=h+'.'+p;const s=crypto.createHmac('sha256',process.env.JWT_SECRET||'test-jwt-secret').update(d).digest('base64url');process.stdout.write(d+'.'+s);")
curl -i -H "Authorization: Bearer $token" http://localhost:3001/reports
```

Stop and clean smoke stack:
```bash
docker compose -f docker/compose.smoke.yml down -v --remove-orphans
```

## Common Operational Tasks

DB refresh cycle:
```bash
pnpm db:refresh
```

Infra logs:
```bash
pnpm infra:logs
```

Stop infra:
```bash
pnpm infra:down
```

If a port is stuck in use on Windows:
```bash
cmd.exe /c "netstat -ano | findstr :3000"
cmd.exe /c "taskkill /PID <PID> /F"
cmd.exe /c "netstat -ano | findstr :3001"
cmd.exe /c "taskkill /PID <PID> /F"
```

Reset infra volumes (destructive):
```bash
pnpm infra:reset
pnpm infra:up
pnpm db:deploy
pnpm db:verify
```

## Incident Runbooks (minimum)

### "Tenant data leakage" (SEV-0)
1. Immediately disable suspect endpoints / feature flags.
2. Confirm RLS is enabled on affected tables; audit GUC setting path (`set_config('app.tenant_id', ...)`).
3. Rotate tokens/secrets if exposure suspected.
4. Add regression tests (RLS e2e) and a new ADR if a structural fix is required.

### "Exports stuck / slow"
1. Check worker lag and job failures.
2. Inspect DB locks and long transactions; exports must not hold locks longer than necessary.
3. Re-run export job with idempotency key; verify output integrity.

## Backup & Restore (to implement)
Policy target is documented in `docs/SECURITY_AND_PRIVACY.md` (RTO <= 4h, RPO <= 1h).

Checklist:
- [ ] Nightly logical backup (pg_dump) and/or physical (pg_basebackup)
- [ ] Encrypted storage
- [ ] Quarterly restore test
- [ ] Document exact restore commands and verification queries here
