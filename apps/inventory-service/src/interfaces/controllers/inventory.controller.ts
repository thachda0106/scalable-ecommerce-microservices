import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  UseGuards,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ReserveStockCommand } from '../../application/commands/reserve-stock.command';
import { ReleaseStockCommand } from '../../application/commands/release-stock.command';
import { ConfirmStockCommand } from '../../application/commands/confirm-stock.command';
import { ReplenishStockCommand } from '../../application/commands/replenish-stock.command';
import { GetInventoryQuery } from '../../application/queries/get-inventory.query';
import { ReserveStockDto } from '../dto/reserve-stock.dto';
import { ReleaseStockDto } from '../dto/release-stock.dto';
import { ConfirmStockDto } from '../dto/confirm-stock.dto';
import { ReplenishStockDto } from '../dto/replenish-stock.dto';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { DomainExceptionFilter } from '../filters/domain-exception.filter';

@Controller('inventory')
@UseGuards(ServiceAuthGuard)
@UseFilters(DomainExceptionFilter)
export class InventoryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':productId')
  async getInventory(@Param('productId') productId: string) {
    return this.queryBus.execute(new GetInventoryQuery(productId));
  }

  @Post('reserve')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async reserveStock(
    @Body() dto: ReserveStockDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.commandBus.execute(
      new ReserveStockCommand(
        dto.items,
        dto.referenceId,
        dto.referenceType,
        dto.idempotencyKey,
        dto.ttlMinutes,
        correlationId,
      ),
    );
  }

  @Post('release')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async releaseStock(
    @Body() dto: ReleaseStockDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.commandBus.execute(
      new ReleaseStockCommand(
        dto.referenceId,
        dto.referenceType,
        dto.productIds,
        dto.idempotencyKey,
        dto.reason,
        correlationId,
      ),
    );
  }

  @Post('confirm')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async confirmStock(
    @Body() dto: ConfirmStockDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.commandBus.execute(
      new ConfirmStockCommand(
        dto.referenceId,
        'ORDER',
        dto.idempotencyKey,
        correlationId,
      ),
    );
  }

  @Post('replenish')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async replenishStock(
    @Body() dto: ReplenishStockDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.commandBus.execute(
      new ReplenishStockCommand(
        dto.items,
        dto.performedBy,
        dto.idempotencyKey,
        correlationId,
      ),
    );
  }
}
