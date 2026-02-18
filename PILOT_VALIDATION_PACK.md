# Pilot Validation Pack (14 Days)

Mode: Validation (not build)

Goal: Get 1 design partner from onboarding → frozen report → exec cockpit → feedback loop.

## 14-Day Execution Checklist

### Day 0 — Internal Prep (Owner: You)
- [ ] Run `pnpm provision:tenant`
- [ ] Create ADMIN + MEMBER user
- [ ] Validate JWT login works
- [ ] Confirm `/health`, `/metrics`
- [ ] Confirm `/pilot` metrics page works
- [ ] Prepare demo tenant via `seed:pilot-demo`
- [ ] Prepare 3-slide system overview deck

Acceptance:
- Freeze a report in `<5 minutes`
- No red errors in logs

### Day 1 — Kickoff Call (60–90 min)
Objective: Get them to first fact.

Agenda:
1. 15 min: ESG workflow overview
2. 15 min: Show frozen demo report
3. 30 min: Have them upload real bill
4. 15 min: Approve + view exec cockpit

Checklist:
- [ ] They upload at least 1 real document
- [ ] They approve a fact themselves
- [ ] They understand freeze concept
- [ ] They understand snapshot immutability

Metric captured:
- `first_fact_at`

### Day 2–3 — Async Data Entry
Ask them to:
- Add 5–10 more entries
- Invite 1 supplier
- Run compliance once

You monitor:
- `% facts approved`
- `supplier invite count`
- `time gap between upload and approval`

Metric captured:
- `first_approval_at`

### Day 4 — Freeze Milestone
Target: First frozen report.

Checklist:
- [ ] They click freeze
- [ ] They export report
- [ ] They understand calcVersion
- [ ] They see completeness %

Metric captured:
- `first_freeze_at`

This is the core milestone.

### Day 5–7 — Exec Usage
Ask them to:
- Open `/exec`
- Review KPIs
- Share with 1 internal stakeholder

Metric captured:
- `first_exec_view_at`

Watch:
- Are they confused by Scope 3 split?
- Do they understand coverage %?

### Day 8–10 — Supplier Engagement
Ask:
- Invite 2–3 suppliers
- Approve responses
- Observe coverage %

Metric:
- `supplier_invite_count`

Key friction:
- Do suppliers understand form?
- Is data quality tier confusing?

### Day 11–14 — Feedback & Refinement
- Conduct structured interview (template below)
- Freeze second period (if possible)
- Ask them to compare deltas

End goal:
- They say: “I would use this quarterly.”

---

## Structured User Interview Template

Use this exactly. Do not improvise.

### Section 1 — Workflow Clarity
1. On a scale of 1–5, how clear was the “freeze” concept?
2. Did anything feel irreversible or risky?
3. At what step did you feel unsure what to do next?

### Section 2 — Data Entry
1. Was uploading bills intuitive?
2. Was approval obvious?
3. What slowed you down?

### Section 3 — Compliance
1. Did you understand why something was PASS or FAIL?
2. Did completeness % feel meaningful?

### Section 4 — Exec Cockpit
1. Did the KPI dashboard feel credible?
2. Did Scope 3 breakdown make sense?
3. Was attribution (“coverage expansion”) clear?

### Section 5 — Value Perception
1. Would you trust this for board reporting?
2. Would you pay for this?
3. What’s missing for you to rely on it?

---

## Friction Logging Framework

Create table:

```sql
CREATE TABLE IF NOT EXISTS esg.pilot_friction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  step text NOT NULL CHECK (step IN ('onboarding','upload','approval','compliance','freeze','exec','supplier')),
  severity text NOT NULL CHECK (severity IN ('low','med','high')),
  description text NOT NULL,
  resolution_status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Severity definitions:
- Low → minor confusion
- Medium → slows user
- High → blocks progress

---

## Weekly Review Cadence (Internal)

Every Friday, review:
1. Avg `time_to_first_freeze`
2. `% reaching freeze`
3. `supplier adoption %`
4. Avg `feedback rating`

Then answer:
- What blocked freeze?
- What confused them?
- What step took longest?
- What question repeated?

Rule:
- Make only `1–2` changes per week, not `10`.

---

## Success Criteria (14 Days)

- Time to first freeze `< 7 days`
- `80%` of pilot users reach freeze
- `50%` invite at least 1 supplier
- Feedback score `>= 4/5`
- No confusion about freeze immutability
- Exec dashboard trusted

If not achieved: fix friction before expanding architecture.

---

## Discipline Rule

Do **not** add before 2 successful pilots:
- Multi-entity rollups
- More frameworks
- Scenario engine
- Advanced analytics

---

## Current Mindset

You are no longer proving architecture.  
You are proving:
- Trust
- Usability
- Speed
- Perceived value

This is product-market fit work.
