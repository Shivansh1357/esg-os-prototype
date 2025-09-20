# Project Rules

These files define authoritative, machine-readable rules for development across the repository. They are derived from the documents under `docs/` and templates under `.github/` and are intended to be consumed by AI assistants and humans alike.

Contents:
- `00-core.mdc`: Core role, context, defaults
- `01-monorepo.mdc`: Structure, ownership, branching, releases
- `02-database.mdc`: SQL-first, RLS, partitions, locks, migrations
- `03-backend.mdc`: NestJS + Kysely patterns, guards, observability
- `04-frontend.mdc`: Next.js, TanStack Query, RHF + Zod, a11y, i18n
- `05-ai.mdc`: AI scope, guardrails, logging, fallbacks
- `06-files-evidence-exports.mdc`: S3, MIME safety, PDF/Excel rules
- `07-security-privacy.mdc`: Security & privacy policies
- `08-testing-ci.mdc`: Tests, E2E, perf budgets, CI gates
- `09-github-templates.mdc`: PR/Issue templates, conventions

Precedence:
- These rules consolidate and reference `docs/*` and `.github/*`. If conflicts arise, update both the source doc and the corresponding rule file via PR.

Usage:
- Tools that support .mdc rules can load the entire `rules/` directory to enforce guardrails across the monorepo.


