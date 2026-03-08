FROM node:24-alpine AS builder

WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
RUN npm install -g pnpm@10

# Copy all source
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Production image
FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app ./
ENV NODE_ENV=production

EXPOSE 3002
CMD ["node", "dist/apps/order-service/main.js"]
