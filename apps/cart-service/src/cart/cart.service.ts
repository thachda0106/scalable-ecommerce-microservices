import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

export class AddItemDto {
  productId: string;
  quantity: number;
  price: number;
}

@Injectable()
export class CartService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;

  onModuleInit() {
    const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
    const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
    this.redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
    });
  }

  onModuleDestroy() {
    this.redisClient.disconnect();
  }

  async getCart(userId: string) {
    const cartData = await this.redisClient.get(`cart:${userId}`);
    return cartData ? JSON.parse(cartData) : { items: [] };
  }

  async addItem(userId: string, item: AddItemDto) {
    const cart = await this.getCart(userId);
    const existingItem = cart.items.find(
      (i: any) => i.productId === item.productId,
    );

    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }

    await this.redisClient.set(`cart:${userId}`, JSON.stringify(cart));
    return cart;
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.getCart(userId);
    cart.items = cart.items.filter((i: any) => i.productId !== productId);

    await this.redisClient.set(`cart:${userId}`, JSON.stringify(cart));
    return cart;
  }

  async clearCart(userId: string) {
    await this.redisClient.del(`cart:${userId}`);
    return { items: [] };
  }
}
