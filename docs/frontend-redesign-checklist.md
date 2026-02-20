# Frontend Redesign Checklist

## Baseline
- [x] Build baseline captured before migration (`pnpm --filter @apps/web build`)
- [x] Test selector contract mapped from `apps/web/tests/*.spec.ts`
- [x] Tailwind + shadcn foundation introduced
- [x] Theme toggle and responsive shell implemented

## Route Migration
- [x] `/`
- [x] `/onboarding`
- [x] `/admin/users`
- [x] `/admin/entities`
- [x] `/data`
- [x] `/emissions`
- [x] `/compliance`
- [x] `/reports`
- [x] `/suppliers`
- [x] `/exec`
- [x] `/audit`
- [x] `/pilot`
- [x] `/s/[token]` public supplier form

## Shared Components
- [x] Navigation shell + theme switcher
- [x] Feedback prompt
- [x] Upload flow modal
- [x] Supplier invite modal
- [x] Evidence attach modal
- [x] Compliance explain modal
- [x] Lineage drawer

## Contracts / QA
- [x] Existing route paths preserved
- [x] Existing `data-test` IDs preserved where previously used by tests
- [x] ESLint configured to avoid interactive prompt
- [x] Full Playwright suite pass
- [x] Mobile and desktop visual QA pass (covered in automated viewport/navigation and manual verification)
