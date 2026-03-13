FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace config first for layer caching
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
RUN npm install -g pnpm@10

# Copy only the needed packages
COPY packages/ ./packages/
COPY apps/api-gateway/ ./apps/api-gateway/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api-gateway build

# Production image
FROM node:24-alpine
WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/api-gateway/package.json ./apps/api-gateway/
COPY --from=builder /app/apps/api-gateway/dist/ ./apps/api-gateway/dist/

RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/api-gateway/dist/main.js"]
