# Deterministic Conflict Resolution Protocol

## Conflict Classes
1. Code conflict: same file/lines, same owner domain.
2. Boundary conflict: edits cross ownership boundaries.
3. Contract conflict: incompatible API/route/selector expectations.
4. Gate conflict: disagreement on release readiness.

## Resolution Order
1. Owner-agent resolve attempt (code-level).
2. Reviewer arbitration:
- Architecture for boundary or contract shape conflicts.
- Security for auth/tenancy/privacy conflicts.
- QA for acceptance evidence conflicts.
3. Orchestrator final decision if unresolved.

## Deterministic Tie-Breakers
1. Preserve frozen contracts by default.
2. Preserve stage-gate passability over local optimization.
3. Prefer backward-compatible changes over breaking changes.
4. Prefer owner-path implementation over requester-path workaround.

## Escalation Packet
Every escalation must include:
- conflicting branches and commit refs
- impacted contract ids (if any)
- failed commands and logs
- options considered and risk tradeoffs
- recommended resolution

## Finalization Rules
- Resolved conflict is recorded in gate evidence packet.
- If resolution impacts frozen contracts, run contract-change protocol before merge.
