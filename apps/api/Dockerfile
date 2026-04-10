FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm

# ── Workspace manifests (for dependency install) ──────────────────────────────
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/ctl/package.json         ./packages/ctl/
COPY packages/suno-exporter/package.json ./packages/suno-exporter/
COPY apps/api/package.json             ./apps/api/

# ── Install all workspace deps ────────────────────────────────────────────────
RUN pnpm install --frozen-lockfile

# ── Source ────────────────────────────────────────────────────────────────────
COPY packages/ctl/src         ./packages/ctl/src
COPY packages/ctl/tsconfig.json ./packages/ctl/
COPY packages/suno-exporter/src         ./packages/suno-exporter/src
COPY packages/suno-exporter/tsconfig.json ./packages/suno-exporter/
COPY apps/api/src             ./apps/api/src
COPY apps/api/tsconfig.json   ./apps/api/

# ── Build ─────────────────────────────────────────────────────────────────────
RUN cd packages/ctl          && pnpm build
RUN cd packages/suno-exporter && pnpm build
RUN cd apps/api              && pnpm build

EXPOSE 3002
CMD ["node", "apps/api/dist/index.js"]
