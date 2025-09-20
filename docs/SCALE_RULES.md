# High-Scale Engineering Rules (v1.0.0)

## Query & Data Access
- All read queries **bounded** (limit + keyset pagination). No OFFSET for >10k rows.
- Composite indexes defined before load. Use `EXPLAIN ANALYZE` on any slow query.
- Avoid N+1 in GraphQL: batch queries (IN lists) or dedicated endpoints.

## Transactions & Locks
- Keep transactions short (<500ms). Avoid chatty loops in tx.
- Use `FOR UPDATE SKIP LOCKED` for consumers and batch approvals.
- Use **advisory locks** for cross-table atomicity (calc/export per `(tenant, entity, period)`).
- Idempotency everywhere: dedupe keys for external inputs.

## Storage & Partitions
- Partition `facts` by quarter; automatic partition creation on insert.
- Reindex during maintenance windows if bloated.
- Archive old partitions (export to S3) if needed.

## Jobs & Backpressure
- Graphile Worker only. Concurrency tuned based on CPU/IO.
- Max retry with exponential backoff; dead-letter queue monitored.
- Backpressure signals: stop inviting suppliers when lag > threshold.

## API Performance
- p95 goals (CI-enforced): 400ms dashboard, 30s recalc, 60s export.
- Cache immutable report exports in S3.
- Gzip/Brotli on responses; ETags for report assets.

## Observability
- Correlate logs by `request_id` and `job_id`.
- Export RED metrics (Rate, Errors, Duration) per service.
- Alert on SLO burns.

## Cost & Limits
- File size cap default 25 MB (configurable).
- Rate limit public endpoints. Bulk ops scheduled via jobs.

## Security & Privacy
- RLS enforced via `SET LOCAL` from ALS.
- PII minimal; store in separate tables with stricter policies if needed.
- Do not log secrets, tokens, or file contents.

## AI Controls
- No direct DB writes from AI service.
- All AI outputs reviewed by user; store provenance (prompt, model, timestamp).
- Tenant isolation: no cross-tenant training or caching.

## Migration Safety
- Always `ADD` then `BACKFILL` then `SWITCH`, never hot-drop columns used by running code.
- Store proc changes: versioned functions, deprecate old after cutover.
