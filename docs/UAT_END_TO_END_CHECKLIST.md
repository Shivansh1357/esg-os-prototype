# UAT End-to-End Checklist

Use this checklist to validate each module manually in addition to automated tests.

## Preflight
- [ ] Infra running (`pnpm infra:up`)
- [ ] DB deployed and verified (`pnpm db:refresh`)
- [ ] API + web are healthy (`pnpm dev` or E2E web servers)
- [ ] Tenant/user env values set for local auth context

## Automated Confidence Command
Run full confidence suite:

```bash
pnpm verify:confidence
```

## Module UAT

## 1) Onboarding (`/onboarding`)
- [ ] Open page and confirm fields render (framework, FY, currency, units)
- [ ] Update fields and click `Continue`
- [ ] Success toast appears
- [ ] No console errors

## 2) Users (`/admin/users`)
- [ ] Enter valid email and click `Invite`
- [ ] Success toast appears
- [ ] Empty email shows validation error toast

## 3) Entities (`/admin/entities`)
- [ ] Add ORG/BU/SITE entity rows
- [ ] New rows appear in table with generated IDs
- [ ] UI remains responsive on repeated adds

## 4) Data Hub (`/data`)
- [ ] Report context banner appears when `reportId` is present
- [ ] Upload flow works: upload -> parse preview -> mapping -> continue
- [ ] At least one row can be approved (`data-test="approve-btn"`)
- [ ] Frozen report disables upload and approvals

## 5) Emissions (`/emissions`)
- [ ] Enter entity UUID and quarter
- [ ] KPI cards render for scope 1/2/3
- [ ] QoQ chart renders
- [ ] `Recalculate` behavior:
  - [ ] Enabled for ADMIN in draft mode
  - [ ] Disabled for frozen report

## 6) Compliance (`/compliance`)
- [ ] Gap table loads and filters work
- [ ] Attach evidence modal opens and resolves finding
- [ ] Explain modal opens and displays checklist
- [ ] Frozen + auditor modes show readonly banners

## 7) Reports (`/reports`)
- [ ] Generate draft (`data-test="generate-draft"`)
- [ ] Export PDF/XLSX/JSON
- [ ] Auditor link generation works
- [ ] Lineage drawer opens
- [ ] Freeze report transitions status Draft -> Frozen

## 8) Suppliers (`/suppliers`)
- [ ] Invite suppliers modal supports CSV import and inline add
- [ ] Invite links generated and displayed
- [ ] Responses table updates after submissions
- [ ] Approve supplier response updates coverage metrics
- [ ] Category chart renders

## 9) Exec Cockpit (`/exec`)
- [ ] KPI grid loads (`data-test="exec-kpi-grid"`)
- [ ] Mode banner switches Live/Snapshot based on report state
- [ ] Scope 3 breakdown values render
- [ ] Attribution note appears when returned by API

## 10) Audit (`/audit`)
- [ ] Period filter and category filter work
- [ ] Event table renders payloads
- [ ] JSON export downloads file

## 11) Pilot (`/pilot`)
- [ ] Admin sees pilot KPI summary cards
- [ ] Non-admin sees `Insufficient permissions.`
- [ ] Feedback stream filter works

## 12) Supplier Public Form (`/s/[token]`)
- [ ] Tokenized page loads supplier metadata
- [ ] English/Hindi toggle works
- [ ] Evidence upload works
- [ ] Submit persists response and shows success message

## Cross-cutting UAT
- [ ] Theme toggle persists across reload/routes
- [ ] Mobile sidebar opens/closes and route links work
- [ ] Keyboard interaction works for feedback modal and dialogs
- [ ] Focus visibility is clear across inputs/buttons

## Regression Gates (must pass before release)
- [ ] `pnpm test:api:jwt`
- [ ] `pnpm test:web:e2e`
- [ ] `pnpm --filter @apps/web lint`
- [ ] `pnpm --filter @apps/web build`
