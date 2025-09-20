# Release Checklist (v1.0.0)

## Pre-release
- [ ] All PRs merged to `main`, CI green
- [ ] Version bump + `CHANGELOG.md` updated
- [ ] `sqitch status` clean (prod vs repo)
- [ ] Feature flags documented
- [ ] Rollback plan prepared

## Validation (Staging)
- [ ] E2E smoke:
  - [ ] Upload → Approve
  - [ ] Recalc totals
  - [ ] BRSR gap → Resolve
  - [ ] Report export (PDF/Excel)
  - [ ] Supplier form → Coverage updates
  - [ ] Auditor lineage
- [ ] Performance budgets pass
- [ ] Security scan & dependency audit

## Deployment
- [ ] Tag `vX.Y.Z`
- [ ] Apply DB migrations
- [ ] Deploy API/Web/Jobs/AI
- [ ] Run post-deploy checks (health, logs)

## Post-release
- [ ] Observability dashboards checked for 24h
- [ ] SLO alerts quiet
- [ ] Announce to stakeholders
