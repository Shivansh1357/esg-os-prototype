FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile --filter @apps/api...

COPY apps/api apps/api

EXPOSE 3001

CMD ["pnpm", "--filter", "@apps/api", "start"]
