# frontend-redesign

## Purpose
Repeatable workflow for production-grade frontend redesign in ESG OS.

## Trigger
Use when asked to redesign UI/UX, modernize visuals, or migrate pages to shadcn + Tailwind patterns.

## Workflow
1. Map current routes/components and `data-test` selector contracts.
2. Install/verify design stack:
   - Tailwind v4
   - shadcn/ui
   - next-themes
   - recharts (if analytics visualizations are needed)
3. Migrate shared shell and tokens first.
4. Migrate pages route-by-route:
   - keep business logic and API calls stable
   - replace inline style usage
   - preserve selectors used by tests
5. Validate:
   - lint/build
   - targeted Playwright specs for changed routes
6. Document:
   - checklist updates
   - assumptions and residual risks

## Constraints
- Do not break existing route paths without explicit approval.
- Prefer reusable components over route-local one-offs.
- Ensure mobile and desktop layouts are both supported.
