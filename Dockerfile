# syntax=docker/dockerfile:1.7
# One image serves three roles: web (default), worker (`npm run worker`) and migrations
# (`npx prisma migrate deploy`). Secrets are injected at runtime — never baked into the image.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
RUN groupadd --system --gid 1001 hausjo && useradd --system --uid 1001 --gid hausjo hausjo \
  && mkdir -p /app/storage && chown hausjo:hausjo /app/storage
COPY --from=build --chown=hausjo:hausjo /app /app
USER hausjo
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
