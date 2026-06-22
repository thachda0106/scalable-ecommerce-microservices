# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/order-service/package.json apps/order-service/
COPY packages/core/package.json packages/core/
COPY packages/events/package.json packages/events/
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/order-service/ apps/order-service/
COPY packages/ packages/
RUN pnpm --filter @ecommerce/core build
RUN pnpm --filter @ecommerce/events build
RUN pnpm --filter order-service build

# Stage 3: Production
FROM node:22-alpine AS production
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --chown=nestjs:nodejs --from=build /app/apps/order-service/dist ./dist
COPY --chown=nestjs:nodejs --from=build /app/apps/order-service/package.json ./
COPY --chown=nestjs:nodejs --from=build /app/node_modules ./node_modules
USER nestjs
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "require('http').get('http://localhost:3000/health',(r)=>{process.exit(r.statusCode===200?0:1)})" || exit 1
CMD ["node", "dist/main.js"]
