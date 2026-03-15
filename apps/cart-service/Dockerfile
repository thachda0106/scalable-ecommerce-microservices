FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace config first for layer caching
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
RUN npm install -g pnpm@10

# Copy only the needed packages
COPY packages/ ./packages/
COPY apps/cart-service/ ./apps/cart-service/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter cart-service build

# Production image
FROM node:24-alpine
WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/cart-service/package.json ./apps/cart-service/
COPY --from=builder /app/apps/cart-service/dist/ ./apps/cart-service/dist/

RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "apps/cart-service/dist/main.js"]
