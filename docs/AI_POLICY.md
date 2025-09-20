# AI Policy & Governance (v1.0.0)

## Scope
Applies to `apps/ai` FastAPI service and any LLM usage.

## Core Principles
- **Assistive, not authoritative.** AI suggests; humans approve.
- **Isolated per tenant.** No cross-tenant data in prompts or caches.
- **Provable provenance.** Store prompt, model, and output with timestamps.

## Allowed AI Functions
- OCR + table extraction from PDFs.
- Column mapping suggestions for CSVs.
- Narrative drafting for reports (with citations).
- Compliance guidance bullets & checklists.
- Executive monthly three-bullet summaries.

## Prohibited
- Auto PASS/FAIL decisions.
- Direct DB writes.
- Training on tenant data without explicit contract.

## Safety & Quality
- Max token limits; truncate inputs.
- Toxicity/PII filters where applicable.
- Confidence scores on mappings; require user confirmation.

## Logging
- Log `model`, `latency`, `tokens`, anonymized prompt hash.
- Do not log raw documents or PII.

## Incident Response
- Disable AI features feature-flag if provider outage.
- Fallback to manual templates and non-LLM parsers.
