---
name: frontend-system-designer
description: Use for Next.js 14 production UX delivery with contract-preserving routes/selectors, accessibility, and deterministic E2E behavior.
---

# frontend-system-designer

## Scope
- Implement and maintain UI flows in `apps/web/**`.
- Preserve route and selector contracts while improving UX.
- Ensure keyboard accessibility and responsive behavior.

## Invariants
- Existing route paths remain stable unless approved.
- Existing Playwright-referenced selectors remain stable unless approved.
- Interactive components remain keyboard-operable with visible focus.

## Forbidden Patterns
- Breaking route remaps without contract approval.
- Removing test selectors used in `apps/web/tests/**`.
- Shipping inaccessible interactive controls.

## Required Validation
- `pnpm --filter @apps/web lint`
- `pnpm --filter @apps/web build`
- Relevant Playwright specs for touched behavior.

## Expected Artifacts
- Route UI change summary.
- Selector contract checklist.
- Accessibility verification notes.
