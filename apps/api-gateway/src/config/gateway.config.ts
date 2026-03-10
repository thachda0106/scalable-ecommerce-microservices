export const GatewayConfig = () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    user: process.env.USER_SERVICE_URL || 'http://localhost:3002',
    product: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3003',
    search: process.env.SEARCH_SERVICE_URL || 'http://localhost:3004',
    cart: process.env.CART_SERVICE_URL || 'http://localhost:3005',
    order: process.env.ORDER_SERVICE_URL || 'http://localhost:3006',
    inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3007',
    payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3008',
    notification:
      process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3009',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'super-secret-key-change-in-prod',
  },
});
