import { registerAs } from "@nestjs/config";

export const ServicesConfig = registerAs("services", () => ({
  auth: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  user: process.env.USER_SERVICE_URL || "http://localhost:3002",
  product: process.env.PRODUCT_SERVICE_URL || "http://localhost:3003",
  search: process.env.SEARCH_SERVICE_URL || "http://localhost:3004",
  cart: process.env.CART_SERVICE_URL || "http://localhost:3005",
  inventory: process.env.INVENTORY_SERVICE_URL || "http://localhost:3006",
  order: process.env.ORDER_SERVICE_URL || "http://localhost:3007",
  payment: process.env.PAYMENT_SERVICE_URL || "http://localhost:3008",
  notification: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3009",
}));
