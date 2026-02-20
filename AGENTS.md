# AGENTS.md

## Purpose
Repository-wide standards for Codex agents working on ESG OS.

## Frontend Contract Rules
- Preserve route paths unless explicitly approved.
- Preserve existing `data-test` selectors used by Playwright unless explicitly approved.
- Prefer shadcn/ui primitives for all new interactive UI.
- Prefer Tailwind utility classes + design tokens; avoid inline styles.
- Preserve business/API behavior while improving presentation and UX.

## Quality Gates
- Run `pnpm --filter @apps/web lint` and `pnpm --filter @apps/web build` before finalizing frontend changes.
- Run relevant Playwright specs for touched behavior.
- Keep accessible focus states and keyboard navigation for dialogs, menus, and forms.

## Delivery Expectations
- Keep changes modular: shared primitive first, then route migration.
- Document major visual/system decisions under `docs/`.
- Add/update tests whenever behavior changes.
