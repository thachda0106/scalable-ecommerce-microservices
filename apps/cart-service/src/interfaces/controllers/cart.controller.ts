import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseFilters,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AddItemCommand } from '../../application/commands/add-item.command';
import { RemoveItemCommand } from '../../application/commands/remove-item.command';
import { ClearCartCommand } from '../../application/commands/clear-cart.command';
import { UpdateItemQuantityCommand } from '../../application/commands/update-item-quantity.command';
import { GetCartQuery } from '../../application/queries/get-cart.query';
import { AddItemDto } from '../dto/add-item.dto';
import { UpdateItemQuantityDto } from '../dto/update-item-quantity.dto';
import { DomainExceptionFilter } from '../filters/domain-exception.filter';

/**
 * CartController — thin interface layer.
 * Contains ZERO business logic.
 * All operations delegate to CommandBus or QueryBus.
 * Domain exceptions are caught by DomainExceptionFilter and mapped to HTTP.
 */
@Controller('cart')
@UseFilters(DomainExceptionFilter)
export class CartController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':userId')
  getCart(@Param('userId') userId: string) {
    return this.queryBus.execute(new GetCartQuery(userId));
  }

  @Post(':userId/items')
  @HttpCode(HttpStatus.OK)
  addItem(@Param('userId') userId: string, @Body() dto: AddItemDto) {
    return this.commandBus.execute(
      new AddItemCommand(
        userId,
        dto.productId,
        dto.quantity,
        dto.snapshottedPrice,
      ),
    );
  }

  @Patch(':userId/items/:productId')
  @HttpCode(HttpStatus.OK)
  updateItemQuantity(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateItemQuantityDto,
  ) {
    return this.commandBus.execute(
      new UpdateItemQuantityCommand(userId, productId, dto.quantity),
    );
  }

  @Delete(':userId/items/:productId')
  @HttpCode(HttpStatus.OK)
  removeItem(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.commandBus.execute(new RemoveItemCommand(userId, productId));
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  clearCart(@Param('userId') userId: string) {
    return this.commandBus.execute(new ClearCartCommand(userId));
  }
}
