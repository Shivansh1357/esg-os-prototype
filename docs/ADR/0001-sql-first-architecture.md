# ADR-0001: SQL-First Architecture with Postgres + Stored Procs + RLS
- **Status:** Accepted
- **Date:** 2025-08-10
- **Owners:** @founder @backend @dba
- **Tags:** database, performance, security, multi-tenant

## Context
We require a highly scalable, multi-tenant backend with auditability, predictable performance, and strong isolation. Heavy ESG computations (calc, reporting, lineage) benefit from running close to data with transactional guarantees.

## Decision
Adopt **PostgreSQL** with:
- **Row Level Security (RLS)** using `SET LOCAL app.tenant_id`, `app.user_id` per request.
- **Stored procedures** for core mutations (idempotent, locked).
- **Partitioned tables** (e.g., `facts` by quarter).
- **Advisory locks** for cross-table atomic operations (calc/export).
- **Kysely + pg** in Node for typed/raw SQL without ORM migrations.
- **Sqitch** for SQL-native migrations (deploy/revert/verify).
- **Graphile Worker** for PG-native jobs (`FOR UPDATE SKIP LOCKED`).

## Consequences
**Pros**
- Strong consistency and isolation (RLS + transactions).
- Performance: push compute to DB; fewer network hops.
- Operability: one system of record (jobs + data) enables simpler ops.
- Auditable lineage via triggers and history tables.

**Cons / Mitigations**
- More SQL/proc expertise needed → code reviews + pgTAP verify.
- Risk of long transactions → strict timeouts & patterns in rules.
- DB as a bottleneck → partitioning, indexes, read scaling if needed.

## Rollout
- All write paths use stored procs from day one.
- RLS policies verified in CI (`sqitch verify`).
- Versioned procs for breaking changes; zero-downtime migrations.

## Alternatives Considered
- Heavy ORM (Prisma/TypeORM): rejected (fights procs/SQL; migration coupling).
- Event-sourced CQRS: overkill for MVP timeline.
- Kafka + Debezium early: postponed to post-MVP if required.

## References
- Monorepo & Scale Rules v1.0.0
- Database migrations under `sql/`
