import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UseFilters,
} from '@nestjs/common';
import {
  CreateOrderDto,
  ShipOrderDto,
  CancelOrderDto,
  RefundOrderDto,
} from '../dto';
import { DomainExceptionFilter } from '../filters';
import { CreateOrderHandler } from '../../application/handlers/create-order.handler';
import { ConfirmPaymentHandler } from '../../application/handlers/confirm-payment.handler';
import { CancelOrderHandler } from '../../application/handlers/cancel-order.handler';
import { ShipOrderHandler } from '../../application/handlers/ship-order.handler';
import { DeliverOrderHandler } from '../../application/handlers/deliver-order.handler';
import { RefundOrderHandler } from '../../application/handlers/refund-order.handler';
import { GetOrderByIdHandler } from '../../application/handlers/get-order-by-id.handler';
import { GetOrdersByUserHandler } from '../../application/handlers/get-orders-by-user.handler';
import { CreateOrderCommand } from '../../application/commands/create-order.command';
import { CancelOrderCommand } from '../../application/commands/cancel-order.command';
import { ShipOrderCommand } from '../../application/commands/ship-order.command';
import { DeliverOrderCommand } from '../../application/commands/deliver-order.command';
import { RefundOrderCommand } from '../../application/commands/refund-order.command';
import { GetOrderByIdQuery } from '../../application/queries/get-order-by-id.query';
import { GetOrdersByUserQuery } from '../../application/queries/get-orders-by-user.query';

@Controller('orders')
@UseFilters(DomainExceptionFilter)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OrderController {
  constructor(
    private readonly createOrderHandler: CreateOrderHandler,
    private readonly confirmPaymentHandler: ConfirmPaymentHandler,
    private readonly cancelOrderHandler: CancelOrderHandler,
    private readonly shipOrderHandler: ShipOrderHandler,
    private readonly deliverOrderHandler: DeliverOrderHandler,
    private readonly refundOrderHandler: RefundOrderHandler,
    private readonly getOrderByIdHandler: GetOrderByIdHandler,
    private readonly getOrdersByUserHandler: GetOrdersByUserHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() dto: CreateOrderDto) {
    const orderId = await this.createOrderHandler.execute(
      new CreateOrderCommand(dto.userId, dto.items),
    );
    return { orderId, message: 'Order created successfully' };
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    const order = await this.getOrderByIdHandler.execute(
      new GetOrderByIdQuery(id),
    );
    return order.toJSON();
  }

  @Get('user/:userId')
  async getOrdersByUser(@Param('userId') userId: string) {
    const orders = await this.getOrdersByUserHandler.execute(
      new GetOrdersByUserQuery(userId),
    );
    return orders.map((order) => order.toJSON());
  }

  @Patch(':id/ship')
  async shipOrder(@Param('id') id: string, @Body() dto: ShipOrderDto) {
    await this.shipOrderHandler.execute(
      new ShipOrderCommand(id, dto.trackingNumber),
    );
    return { message: `Order ${id} shipped` };
  }

  @Patch(':id/deliver')
  @HttpCode(HttpStatus.OK)
  async deliverOrder(@Param('id') id: string) {
    await this.deliverOrderHandler.execute(new DeliverOrderCommand(id));
    return { message: `Order ${id} delivered` };
  }

  @Patch(':id/cancel')
  async cancelOrder(@Param('id') id: string, @Body() dto: CancelOrderDto) {
    await this.cancelOrderHandler.execute(
      new CancelOrderCommand(id, dto.reason),
    );
    return { message: `Order ${id} cancelled` };
  }

  @Patch(':id/refund')
  async refundOrder(@Param('id') id: string, @Body() dto: RefundOrderDto) {
    await this.refundOrderHandler.execute(
      new RefundOrderCommand(id, dto.reason),
    );
    return { message: `Order ${id} refunded` };
  }
}
