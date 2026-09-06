# The realtime server.
#
# Built from the MONOREPO ROOT, not from this directory:
#   docker build -f apps/server/Dockerfile -t shard-islands-server .
#
# The server imports @shard-islands/shared through the pnpm workspace, and a
# build context of apps/server alone cannot see it.

# ---- build ------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Manifests first, so editing a source file does not re-download the whole
# dependency tree on every build.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter server...

COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter server build

# ---- run --------------------------------------------------------------
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=2567

# The build produces ONE self-contained CommonJS file with every dependency
# bundled into it, so the runtime image needs no node_modules at all — which
# also sidesteps the fact that a pnpm install is a farm of symlinks pointing
# back into a store that does not exist over here.
#
# CommonJS rather than ESM on purpose: `debug`, deep inside Colyseus, does a
# dynamic require of "tty", and a dynamic require is exactly the thing an
# ESM bundle cannot do. It fails at startup, not at build.
COPY --from=build /repo/apps/server/dist/index.cjs ./index.cjs

# Not root. This process parses hostile input all day.
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 2567
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:2567/health || exit 1

CMD ["node", "index.cjs"]
