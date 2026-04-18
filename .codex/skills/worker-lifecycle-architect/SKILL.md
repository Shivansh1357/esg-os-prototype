---
name: worker-lifecycle-architect
description: Use for designing and validating queue/worker lifecycles with lock safety, idempotency, retries, and transaction integrity.
---

# worker-lifecycle-architect

## Scope
- Define and review background job lifecycle in worker and enqueue paths.
- Ensure advisory lock discipline and idempotent job processing.
- Harden retry and failure handling.

## Invariants
- Jobs are idempotent under retries and duplicate delivery.
- Critical updates happen in safe transactional boundaries.
- Locking strategy prevents race conditions.

## Forbidden Patterns
- Non-transactional multi-step writes for critical job paths.
- Missing lock/idempotency keys for high-contention work.
- Side effects without retry safety model.

## Required Validation
- Worker path tests and recalc tests.
- Concurrency/race-condition reasoning documented.
- Failover and retry behavior reviewed.

## Expected Artifacts
- Worker contract and state-transition notes.
- Retry/backoff policy summary.
- Failure-mode checklist.
