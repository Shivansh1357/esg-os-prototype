# Codex MCP Setup

## Goal
Enable faster UI and engineering workflows for ESG OS contributors.

## Recommended MCP Servers
- `filesystem`: project-wide file access and refactors.
- `git`: branch/status/diff context.
- `playwright`: browser interaction for UI validation and visual checks.
- `docs`/`http`: reference framework docs (Next.js, Tailwind, shadcn).

## Suggested Configuration Practices
- Keep MCP server definitions in user-local Codex config (not committed secrets).
- Use read-only web/docs servers by default.
- Reserve any high-risk write-capable MCP for trusted sessions only.

## Operational Pattern
1. Discover context with filesystem + git.
2. Implement changes with filesystem.
3. Validate interaction with playwright.
4. Summarize diffs and risks before handoff.
