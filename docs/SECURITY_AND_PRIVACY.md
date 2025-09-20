# Security & Privacy Policy (v1.0.0)

## Identity & Access
- OIDC (Auth0). JWT includes `tenantId`, `role`.
- **RBAC** checked server-side on every resolver.
- SCIM user provisioning (Enterprise, post-MVP).

## Data Security
- **RLS** on all tenant data; `SET LOCAL app.tenant_id` from ALS per request.
- Encryption: TLS 1.2+, AES-256 at rest (RDS, S3).
- Evidence files immutable; content hashes stored.

## Secrets Management
- Dev via `.env.local` only. Staging/Prod via secrets manager.
- Rotation quarterly or on incident.

## Upload Safety
- Only allow CSV, XLSX, PDF; MIME sniffing + size caps.
- Virus scan (optional) queue before persisting evidence pointer.

## Logging & Monitoring
- PII redaction in logs. Structured logging (pino).
- Alerts: failed logins, escalations, unusual download volume.

## Disaster Recovery
- Backups nightly; RTO ≤ 4h, RPO ≤ 1h.
- Restore runbook tested quarterly.

## Vendor & Third-party
- AI provider: no data used for training; region-appropriate processing.
- Email/SMS vendors must support TLS.

## Compliance
- BRSR requirements tracked in `libs/rules`.
- SOC2-lite controls mapped; full certification later.

## Vulnerability Handling
- Report to security contact. Acknowledge within 48h; patch within 7 days for High/Critical.
