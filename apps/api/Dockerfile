FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm

# ── Workspace manifests ───────────────────────────────────────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ctl/package.json              ./packages/ctl/
COPY packages/suno-exporter/package.json    ./packages/suno-exporter/
COPY packages/ac-ami/package.json           ./packages/ac-ami/
COPY packages/replicate-client/package.json ./packages/replicate-client/
COPY apps/api/package.json                  ./apps/api/

# ── Install ───────────────────────────────────────────────────────────────────
RUN pnpm install --frozen-lockfile

# ── Source ────────────────────────────────────────────────────────────────────
COPY packages/ctl/src              ./packages/ctl/src
COPY packages/ctl/tsconfig.json    ./packages/ctl/
COPY packages/suno-exporter/src              ./packages/suno-exporter/src
COPY packages/suno-exporter/tsconfig.json    ./packages/suno-exporter/
COPY packages/ac-ami/src              ./packages/ac-ami/src
COPY packages/ac-ami/tsconfig.json    ./packages/ac-ami/
COPY packages/replicate-client/src              ./packages/replicate-client/src
COPY packages/replicate-client/tsconfig.json    ./packages/replicate-client/
COPY apps/api/src             ./apps/api/src
COPY apps/api/tsconfig.json   ./apps/api/

# ── Build ─────────────────────────────────────────────────────────────────────
RUN cd packages/ctl              && pnpm build
RUN cd packages/replicate-client && pnpm build
RUN cd packages/ac-ami           && pnpm build
RUN cd packages/suno-exporter    && pnpm build
RUN cd apps/api                  && pnpm build

EXPOSE 3003
CMD ["node", "apps/api/dist/index.js"]
