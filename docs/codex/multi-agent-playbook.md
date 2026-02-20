# Multi-Agent Playbook (Frontend Redesign)

## Workstream Split
- **Agent A (Design System):** tokens, themes, shadcn primitives, shell layout.
- **Agent B (Core Routes):** `/reports`, `/data`, `/compliance`, `/emissions`.
- **Agent C (Secondary Routes):** `/exec`, `/suppliers`, `/audit`, `/pilot`, admin pages.
- **Agent D (QA):** Playwright non-regression + accessibility checks.

## Coordination Protocol
1. Lock contracts first: paths + `data-test` selectors.
2. Merge design-system branch before route branches.
3. Rebase route branches after shell merge.
4. Run targeted E2E specs per route set before merging.

## Merge Order
1. Design system + shell
2. Core routes
3. Secondary routes
4. QA and cleanup

## Definition of Done
- Build/lint pass.
- Selector contracts preserved.
- Visual consistency across light/dark and mobile/desktop.
