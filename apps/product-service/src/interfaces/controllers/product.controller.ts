import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseFilters,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../filters/domain-exception.filter';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { GetProductsQueryDto } from '../dto/get-products-query.dto';
import { UpdateProductStatusDto } from '../dto/update-product-status.dto';
import { CreateProductHandler } from '../../application/handlers/create-product.handler';
import { UpdateProductHandler } from '../../application/handlers/update-product.handler';
import { DeleteProductHandler } from '../../application/handlers/delete-product.handler';
import { UpdateProductStatusHandler } from '../../application/handlers/update-product-status.handler';
import { GetProductByIdHandler } from '../../application/handlers/get-product-by-id.handler';
import { GetProductsHandler } from '../../application/handlers/get-products.handler';
import { CreateProductCommand } from '../../application/commands/create-product.command';
import { UpdateProductCommand } from '../../application/commands/update-product.command';
import { DeleteProductCommand } from '../../application/commands/delete-product.command';
import { UpdateProductStatusCommand } from '../../application/commands/update-product-status.command';
import { GetProductByIdQuery } from '../../application/queries/get-product-by-id.query';
import { GetProductsQuery } from '../../application/queries/get-products.query';

@Controller('products')
@UseFilters(DomainExceptionFilter)
export class ProductController {
  constructor(
    private readonly createProductHandler: CreateProductHandler,
    private readonly updateProductHandler: UpdateProductHandler,
    private readonly deleteProductHandler: DeleteProductHandler,
    private readonly updateProductStatusHandler: UpdateProductStatusHandler,
    private readonly getProductByIdHandler: GetProductByIdHandler,
    private readonly getProductsHandler: GetProductsHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProductDto) {
    const id = await this.createProductHandler.execute(
      new CreateProductCommand(
        dto.name,
        dto.description,
        dto.price,
        dto.currency ?? 'USD',
        dto.categoryId,
      ),
    );
    return { id };
  }

  @Get()
  async findAll(@Query() dto: GetProductsQueryDto) {
    return this.getProductsHandler.execute(
      new GetProductsQuery(
        dto.page,
        dto.limit,
        dto.sortBy,
        dto.sortOrder,
        dto.status,
        dto.categoryId,
        dto.minPrice,
        dto.maxPrice,
        dto.search,
      ),
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const product = await this.getProductByIdHandler.execute(
      new GetProductByIdQuery(id),
    );
    return product.toJSON();
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    await this.updateProductHandler.execute(
      new UpdateProductCommand(
        id,
        dto.name,
        dto.description,
        dto.price,
        dto.currency,
        dto.categoryId,
      ),
    );
    return { message: 'Product updated' };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    await this.updateProductStatusHandler.execute(
      new UpdateProductStatusCommand(id, dto.action),
    );
    return { message: 'Product status updated' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.deleteProductHandler.execute(new DeleteProductCommand(id));
  }
}
