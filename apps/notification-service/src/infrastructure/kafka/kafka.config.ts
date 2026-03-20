export const kafkaConfig = {
  clientId: process.env.KAFKA_CLIENT_ID || 'notification-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  consumerGroups: {
    userEvents:
      process.env.KAFKA_GROUP_USER_EVENTS || 'notification-service-user-events',
    orderEvents:
      process.env.KAFKA_GROUP_ORDER_EVENTS ||
      'notification-service-order-events',
    cartEvents:
      process.env.KAFKA_GROUP_CART_EVENTS || 'notification-service-cart-events',
  },
  topics: {
    userEvents: process.env.KAFKA_TOPIC_USER_EVENTS || 'user.events',
    orderEvents: process.env.KAFKA_TOPIC_ORDER_EVENTS || 'order.events',
    cartEvents: process.env.KAFKA_TOPIC_CART_EVENTS || 'cart.events',
  },
  dlq: {
    topic: process.env.KAFKA_DLQ_TOPIC || 'notification.dlq',
  },
};
