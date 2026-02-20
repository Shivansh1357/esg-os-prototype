# Founder Demo Script (12–15 Minutes)

Use this as a live script with exact click flow and narration.

## Demo Goal
Show that ESG Console can take a customer from setup to audit-ready reporting in one governed workflow.

## Before You Start (2 minutes)
1. Run:
```bash
pnpm verify:confidence
```
2. Ensure app opens at `http://localhost:5050`.
3. Keep one test tenant/user active in env.
4. Start in light mode (clean look for first impression).

## Demo Flow (Exact Click Path + Talk Track)

| Time | Click Path | What To Say | Proof On Screen |
|---|---|---|---|
| 0:00–0:45 | Open `/onboarding` | “We start by setting reporting defaults once per tenant.” | Framework/FY/currency/units form |
| 0:45–1:30 | Set values, click `Continue` | “This standardizes reporting settings before any data enters the system.” | Success toast |
| 1:30–2:15 | Open `/admin/entities` | “Now we model organization structure: org, BU, site.” | Entity creation + table |
| 2:15–3:00 | Add sample entity rows | “Every metric later ties back to accountable entities.” | New entity rows visible |
| 3:00–4:45 | Open `/data`, click `Upload`, import sample CSV, click `Start`, then `Continue`, close modal, approve one fact | “This is the critical intake layer: upload, AI-assisted mapping, then human approval.” | Parse preview, mapping step, approved fact |
| 4:45–5:45 | Open `/emissions`, set entity + quarter, click `Recalculate` | “As facts are approved, emissions recalc is controlled and reproducible.” | Scope cards + QoQ chart + recalc notice |
| 5:45–7:00 | Open `/compliance`, filter FAIL/RISK, open `Attach evidence`, submit, open `Explain` | “Compliance is not a spreadsheet. Gaps are tracked with evidence and remediation guidance.” | Gap table, evidence attachment, explain modal |
| 7:00–8:45 | Open `/reports`, click `Generate Draft`, then `Export PDF` and `Export XLSX` | “Draft generation and export are one click, with mode-aware output.” | Status block, export result messages |
| 8:45–9:45 | In `/reports`, click `Freeze report` | “Freeze creates an immutable reporting snapshot for assurance.” | Status changes to Frozen, snapshot mode banner |
| 9:45–10:45 | Open `/exec?reportId=...` (or use nav with report context) | “Leadership gets decision-ready KPIs and trend context, not raw tables.” | KPI grid, mode banner, scope breakdown |
| 10:45–11:45 | Open `/suppliers`, click `Invite suppliers`, show generated links, approve response if seeded | “Scope 3 collection is built-in: invite, collect, approve, track coverage.” | Coverage cards, supplier workflow |
| 11:45–12:45 | Open `/audit` and export JSON | “Every major action is traceable with event logs and payload context.” | Audit events + JSON export |
| 12:45–13:30 | Open `/pilot?mode=admin` | “Pilot dashboard shows rollout progress and user feedback quality.” | Pilot KPI cards + feedback stream |
| 13:30–14:30 | Open supplier public link `/s/[token]` | “External suppliers submit through tokenized, low-friction forms with evidence upload.” | Public form, bilingual toggle, submit action |
| 14:30–15:00 | Return to `/reports` or `/exec` | “From intake to frozen, auditable output—this is one integrated ESG operating system.” | Frozen report + exec snapshot |

## Founder Narration (Use Verbatim)
1. “Most teams patch ESG reporting with spreadsheets, emails, and last-minute reconciliations.”
2. “We replace that with one controlled workflow: data intake, approval, compliance closure, report freeze, and audit trace.”
3. “The key difference is governance: every number can be traced to source evidence and status.”
4. “This reduces reporting cycle time while increasing assurance confidence.”

## Objection Handling During Demo
| Objection | Response |
|---|---|
| “How do we trust these numbers?” | “Every metric has source refs, approval state, and audit logs. Freeze locks snapshots for reproducibility.” |
| “What about Scope 3 complexity?” | “Supplier invite/response/approval and coverage metrics are built into the product, not external workflows.” |
| “How do auditors use this?” | “Frozen mode + lineage + exportable artifacts provide a clear assurance package.” |
| “Will this fit our process?” | “Entity model and role-based workflows are configurable around your reporting operating model.” |

## If Something Breaks Live
1. Say: “I’ll show the same proof from the audit-safe path.”
2. Move to `/reports` and show frozen status + exports.
3. Move to `/audit` and show the action event trail.
4. Continue with value narrative; avoid deep debugging in-demo.

## Post-Demo Close (30 seconds)
Use this exact close:
“If we run a pilot with one business unit and one reporting cycle, we can measure three things quickly: time-to-report, compliance gap closure speed, and audit readiness. If those improve, we scale across entities.”
