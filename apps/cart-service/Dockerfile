# Stage 1: Install dependencies
FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/cart-service/package.json apps/cart-service/
COPY packages/core/package.json packages/core/
COPY packages/events/package.json packages/events/
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/cart-service/ apps/cart-service/
COPY packages/ packages/
RUN pnpm --filter @ecommerce/core build
RUN pnpm --filter @ecommerce/events build
RUN pnpm --filter cart-service build

# Stage 3: Production
FROM node:24-alpine AS production
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --from=build /app/apps/cart-service/dist ./dist
COPY --from=build /app/apps/cart-service/package.json ./
COPY --from=build /app/node_modules ./node_modules
USER nestjs
ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "dist/main.js"]
