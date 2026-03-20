import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseFilters,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ProcessPaymentDto } from '../dto/process-payment.dto';
import { RefundPaymentDto } from '../dto/refund-payment.dto';
import { DomainExceptionFilter } from '../filters/domain-exception.filter';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { ProcessPaymentCommand } from '../../application/commands/process-payment.command';
import { RefundPaymentCommand } from '../../application/commands/refund-payment.command';
import { GetPaymentByIdQuery } from '../../application/queries/get-payment-by-id.query';
import { GetPaymentsByOrderQuery } from '../../application/queries/get-payments-by-order.query';
import { ProcessPaymentHandler } from '../../application/handlers/process-payment.handler';
import { RefundPaymentHandler } from '../../application/handlers/refund-payment.handler';
import { GetPaymentByIdHandler } from '../../application/handlers/get-payment-by-id.handler';
import { GetPaymentsByOrderHandler } from '../../application/handlers/get-payments-by-order.handler';

@Controller('payments')
@UseGuards(ServiceAuthGuard)
@UseFilters(DomainExceptionFilter)
export class PaymentController {
  constructor(
    private readonly processPaymentHandler: ProcessPaymentHandler,
    private readonly refundPaymentHandler: RefundPaymentHandler,
    private readonly getPaymentByIdHandler: GetPaymentByIdHandler,
    private readonly getPaymentsByOrderHandler: GetPaymentsByOrderHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async processPayment(@Body() dto: ProcessPaymentDto) {
    const command = new ProcessPaymentCommand(
      dto.orderId,
      dto.userId,
      dto.amountInCents,
      dto.currency || 'USD',
      dto.provider,
      dto.idempotencyKey,
    );
    return this.processPaymentHandler.execute(command);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  async refundPayment(@Param('id') id: string, @Body() dto: RefundPaymentDto) {
    const command = new RefundPaymentCommand(id, dto.reason);
    return this.refundPaymentHandler.execute(command);
  }

  @Get(':id')
  async getPayment(@Param('id') id: string) {
    const query = new GetPaymentByIdQuery(id);
    const payment = await this.getPaymentByIdHandler.execute(query);
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    return payment;
  }

  @Get('order/:orderId')
  async getPaymentsByOrder(@Param('orderId') orderId: string) {
    const query = new GetPaymentsByOrderQuery(orderId);
    return this.getPaymentsByOrderHandler.execute(query);
  }
}
