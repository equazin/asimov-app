# Dockerfile de la API Asimov (monorepo pnpm + NestJS + Prisma).
# Contexto de build esperado: el directorio v2/.
# Railway: Root Directory = v2  → detecta este Dockerfile automáticamente.

# ---------- Builder ----------
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# 1) Manifests primero (mejor cache de instalación).
#    Se copian los 4 package.json para que el workspace coincida con el lockfile
#    (--frozen-lockfile lo exige), pero solo instalamos api + sus deps (shared).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/admin/package.json packages/admin/
COPY packages/mobile/package.json packages/mobile/
RUN pnpm install --frozen-lockfile --filter @asimov/api...

# 2) Código fuente (solo shared + api; admin/mobile no se buildean acá)
COPY packages/shared packages/shared
COPY packages/api packages/api

# 3) Prisma client + build (shared antes que api)
RUN pnpm --filter @asimov/api exec prisma generate
RUN pnpm --filter @asimov/shared build
RUN pnpm --filter @asimov/api build

# ---------- Runner ----------
FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_ENV=production

# Copiamos el árbol completo (incluye node_modules del monorepo con symlinks pnpm)
COPY --from=builder /app ./

WORKDIR /app/packages/api
# start:prod = prisma migrate deploy && node dist/main.js
CMD ["pnpm", "run", "start:prod"]
