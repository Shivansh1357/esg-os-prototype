# Run Book

Last updated: 2026-02-15

This is the operator/developer run book for running, debugging, and recovering ESG OS.

## Local Dev Quickstart

Use repository-root commands from `c:/Users/ShivanshTripathi/Projects/esg-os-prototype`.

Important shell note:
- In Git Bash: use `pnpm ...` (not `pnpm.cmd ...`, not PowerShell `$env:...` syntax).
- In PowerShell/CMD: `pnpm ...` is also fine if `pnpm` is on PATH.

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

## Test Suites

API tests:
```bash
pnpm test:api
```

Web E2E tests:
```bash
pnpm test:web:e2e
```

All workspace tests:
```bash
pnpm test:all
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
