import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AddItemCommand } from '../../application/commands/add-item.command';
import { RemoveItemCommand } from '../../application/commands/remove-item.command';
import { ClearCartCommand } from '../../application/commands/clear-cart.command';
import { GetCartQuery } from '../../application/queries/get-cart.query';
import { AddItemDto } from '../dto/add-item.dto';

/**
 * CartController — thin interface layer.
 * Contains ZERO business logic.
 * All operations delegate to CommandBus or QueryBus.
 */
@Controller('cart')
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
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  addItem(@Param('userId') userId: string, @Body() dto: AddItemDto) {
    return this.commandBus.execute(
      new AddItemCommand(userId, dto.productId, dto.quantity, dto.snapshottedPrice),
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
