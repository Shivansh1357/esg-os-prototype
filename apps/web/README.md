# Web (Next.js 14)

Next.js App Router frontend for ESG OS.

## Run
```bash
pnpm install
pnpm dev
```

## Env
- `NEXT_PUBLIC_API_URL` (e.g., http://localhost:5051)
- `NEXT_PUBLIC_AI_URL` (optional, defaults to API URL)
- `NEXT_PUBLIC_TENANT_ID`, `NEXT_PUBLIC_USER_ID` (dev/testing headers)
- `NEXT_PUBLIC_DEFAULT_FACTOR_SET_ID` (optional), `NEXT_PUBLIC_FACTOR_SET_LABEL` (optional)

## Tests
```bash
pnpm test:e2e
```

## Notes
- Uses TanStack Query for server state and data fetching.
- Calls AI endpoints via `NEXT_PUBLIC_AI_URL` if provided.
