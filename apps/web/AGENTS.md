# Web AGENTS.md

## Scope
Applies to `apps/web` only.

## UI/UX Rules
- Use shadcn/ui components from `components/ui`.
- Use product wrappers from `components/product` for consistent page structure.
- Keep light/dark theme compatibility.
- Avoid direct DOM manipulation (`document.getElementById`, `prompt`, `alert`) when possible.
- Keep forms controlled and typed.

## Test/Selector Rules
- Maintain all existing `data-test` selectors referenced by Playwright tests.
- When adding new interactions, add stable `data-test` ids only where needed.

## Performance Rules
- Avoid unnecessary client-side state duplication.
- Prefer memoized derived data for dashboards/charts.
- Keep route bundles lean by reusing shared components.
