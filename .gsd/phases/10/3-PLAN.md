---
phase: 10
plan: 3
wave: 2
depends_on: [1, 2]
files_modified:
  - apps/cart-service/src/infrastructure/redis/cart-cache.repository.ts
  - apps/cart-service/src/infrastructure/kafka/cart-events.producer.ts
  - apps/cart-service/src/infrastructure/persistence/cart.schema.ts
  - apps/cart-service/src/infrastructure/repositories/cart.repository.ts
  - apps/cart-service/src/infrastructure/http/product-service.client.ts
  - apps/cart-service/src/infrastructure/http/inventory-service.client.ts
  - apps/cart-service/src/interfaces/dto/add-item.dto.ts
  - apps/cart-service/src/interfaces/dto/remove-item.dto.ts
  - apps/cart-service/src/interfaces/controllers/cart.controller.ts
  - apps/cart-service/src/cart.module.ts
  - apps/cart-service/src/app.module.ts
  - apps/cart-service/src/main.ts
  - apps/cart-service/package.json
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Redis uses key cart:{userId} with TTL 7 days (604800 seconds), matching ARCHITECTURE.md"
    - "Kafka producer publishes to topic = event.eventType (e.g. cart.item_added)"
    - "CartRepository stores carts in memory (Map) as a starting point — no DB dependency needed to run"
    - "HTTP clients have graceful fallback (return true) if services unreachable, to allow independent dev"
    - "CartController is thin: each route calls CommandBus.execute() or QueryBus.execute() only"
    - "DTOs use class-validator decorators"
  artifacts:
    - "apps/cart-service/src/cart.module.ts registers CqrsModule, all handlers, all providers with injection tokens"
    - "apps/cart-service/src/interfaces/controllers/cart.controller.ts has 4 routes (GET, POST, DELETE item, DELETE cart)"
---

# Plan 10.3: Infrastructure Layer, DTOs, Controller & Module Wiring

<objective>
Implement all infrastructure adapters (Redis cache, Kafka producer, in-memory repository, HTTP clients), the thin HTTP controller with DTOs, and wire everything into CartModule.

Purpose: This plan brings the entire service to a runnable state by connecting the application ports to concrete adapters.
Output: 6 infrastructure files, 2 DTOs, 1 controller, 1 CartModule, updated AppModule/main.ts.
</objective>

<context>
Load for context:
- apps/cart-service/src/application/ports/cart-repository.port.ts
- apps/cart-service/src/application/ports/cart-cache.port.ts
- apps/cart-service/src/application/ports/cart-events.port.ts
- apps/cart-service/src/application/handlers/add-item.handler.ts
- apps/auth-service/src/infrastructure/redis/   (reference pattern)
- apps/auth-service/src/infrastructure/kafka/   (reference pattern)
- apps/cart-service/src/app.module.ts
- apps/cart-service/src/main.ts
- .gsd/ARCHITECTURE.md  (Redis TTL 7 days, cart:{userId} key)
</context>

<tasks>

<task type="auto">
  <name>Implement Redis cache, Kafka producer, in-memory repository and HTTP clients</name>
  <files>
    apps/cart-service/src/infrastructure/redis/cart-cache.repository.ts
    apps/cart-service/src/infrastructure/kafka/cart-events.producer.ts
    apps/cart-service/src/infrastructure/persistence/cart.schema.ts
    apps/cart-service/src/infrastructure/repositories/cart.repository.ts
    apps/cart-service/src/infrastructure/http/product-service.client.ts
    apps/cart-service/src/infrastructure/http/inventory-service.client.ts
  </files>
  <action>
    **cart-cache.repository.ts** — implements `ICartCache`:
    - `@Injectable()` class `CartCacheRepository implements ICartCache`
    - Constructor: inject `ioredis` Redis client — use `@Inject('REDIS_CLIENT') private redis: Redis`
    - `get(userId)`: `const raw = await this.redis.get(\`cart:${userId}\`)` → if raw, parse JSON and reconstitute `Cart.reconstitute(parsed.id, parsed.userId, items)` → return Cart or null
    - `set(userId, cart)`: `await this.redis.setex(\`cart:${userId}\`, 604800, JSON.stringify(cart.toJSON()))` — 604800 = 7 days
    - `invalidate(userId)`: `await this.redis.del(\`cart:${userId}\`)`

    **cart-events.producer.ts** — implements `ICartEventsProducer`:
    - `@Injectable()` class `CartEventsProducer implements ICartEventsProducer`
    - Constructor: `private readonly kafka = new Kafka({ clientId: 'cart-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] })` — create producer in onModuleInit, disconnect in onModuleDestroy
    - `publish(event: BaseDomainEvent)`: `await this.producer.send({ topic: event.eventType, messages: [{ key: (event as any).userId, value: JSON.stringify(event) }] })`
    - Wrap in try/catch — log error but DO NOT throw (non-blocking for domain flow)

    **cart.schema.ts** — CartDocument shape for future MongoDB:
    ```ts
    export interface CartDocument {
      id: string;
      userId: string;
      items: { productId: string; quantity: number; snapshottedPrice: number }[];
      updatedAt: Date;
    }
    ```
    (No Mongoose Schema decorator needed yet — this is the data shape)

    **cart.repository.ts** — in-memory implementation `ICartRepository`:
    - `@Injectable()` class `InMemoryCartRepository implements ICartRepository`
    - Private `store = new Map<string, CartDocument>()`
    - `findByUserId(userId)`: if not found return null; else reconstitute `Cart.reconstitute(...)`
    - `save(cart)`: `this.store.set(cart.userId, { id: cart.id, userId: cart.userId, items: cart.items.map(i => i.toJSON()), updatedAt: new Date() })`
    - NOTE: Add a comment "// TODO: Replace with MongoDB adapter in production"

    **product-service.client.ts**:
    - `@Injectable()` class `ProductServiceClient`
    - Constructor: `private readonly httpService: HttpService` (from @nestjs/axios)
    - `validateProduct(productId: string): Promise<boolean>`:
      - GET `${process.env.PRODUCT_SERVICE_URL || 'http://product-service:3003'}/products/${productId}`
      - Return true if 200, false if 404
      - Catch any error → log warn and return `true` (graceful fallback — cart works even if product-service is down)

    **inventory-service.client.ts**:
    - `@Injectable()` class `InventoryServiceClient`
    - `checkStock(productId: string, quantity: number): Promise<boolean>`:
      - GET `${process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3006'}/inventory/${productId}/available?quantity=${quantity}`
      - Return true if 200 response body `{ available: true }`, false otherwise
      - Catch → log warn and return `true` (graceful fallback)

    AVOID using axios directly — use @nestjs/axios HttpService.
    AVOID throwing in Kafka producer publish — it must be non-blocking.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "infrastructure" || echo "Infrastructure compiles OK"</verify>
  <done>6 infrastructure files exist. Redis uses setex with 7-day TTL. Kafka publish wraps in try/catch. InMemoryCartRepository uses Map. HTTP clients return true on error (graceful fallback).</done>
</task>

<task type="auto">
  <name>Create DTOs, thin controller, CartModule and wire AppModule</name>
  <files>
    apps/cart-service/src/interfaces/dto/add-item.dto.ts
    apps/cart-service/src/interfaces/dto/remove-item.dto.ts
    apps/cart-service/src/interfaces/controllers/cart.controller.ts
    apps/cart-service/src/cart.module.ts
    apps/cart-service/src/app.module.ts
    apps/cart-service/src/main.ts
    apps/cart-service/package.json
  </files>
  <action>
    **add-item.dto.ts**:
    ```ts
    import { IsUUID, IsInt, Min, Max, IsNumber, IsPositive } from 'class-validator';
    export class AddItemDto {
      @IsUUID('4') productId: string;
      @IsInt() @Min(1) @Max(99) quantity: number;
      @IsNumber() @IsPositive() snapshottedPrice: number;
    }
    ```

    **remove-item.dto.ts** — only a param, but create for completeness:
    ```ts
    export class RemoveItemParamsDto {
      userId: string;
      productId: string;
    }
    ```

    **cart.controller.ts** in `interfaces/controllers/`:
    ```ts
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
      @UsePipes(new ValidationPipe({ transform: true }))
      addItem(@Param('userId') userId: string, @Body() dto: AddItemDto) {
        return this.commandBus.execute(new AddItemCommand(userId, dto.productId, dto.quantity, dto.snapshottedPrice));
      }

      @Delete(':userId/items/:productId')
      removeItem(@Param('userId') userId: string, @Param('productId') productId: string) {
        return this.commandBus.execute(new RemoveItemCommand(userId, productId));
      }

      @Delete(':userId')
      clearCart(@Param('userId') userId: string) {
        return this.commandBus.execute(new ClearCartCommand(userId));
      }
    }
    ```
    Import: CommandBus, QueryBus from @nestjs/cqrs. All 4 commands/queries from application layer.

    **cart.module.ts**:
    ```ts
    @Module({
      imports: [CqrsModule, HttpModule],
      controllers: [CartController],
      providers: [
        // Handlers
        AddItemHandler, RemoveItemHandler, ClearCartHandler, GetCartHandler,
        // Infrastructure adapters bound to port tokens
        { provide: CART_REPOSITORY, useClass: InMemoryCartRepository },
        { provide: CART_CACHE, useClass: CartCacheRepository },
        { provide: CART_EVENTS_PRODUCER, useClass: CartEventsProducer },
        // Redis client factory
        {
          provide: 'REDIS_CLIENT',
          useFactory: () => new Redis({ host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') }),
        },
        // HTTP clients
        ProductServiceClient, InventoryServiceClient,
      ],
    })
    export class CartModule {}
    ```

    **app.module.ts**: Replace CartModule import path from `./cart/cart.module` to `./cart.module`. Remove the old cart/ folder import. Keep getLoggerModule().

    **main.ts**: Add `app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))` before `app.listen()`. Import ValidationPipe from @nestjs/common.

    **package.json**: Add to dependencies:
    - `"@nestjs/cqrs": "^10.2.7"` (or latest compatible with NestJS v11 - check @nestjs/cqrs v10)
    - `"@nestjs/axios": "^3.0.0"`
    - `"axios": "^1.6.0"`
    - `"kafkajs": "^2.2.4"`
    - `"class-validator": "^0.14.0"`
    - `"class-transformer": "^0.5.1"`

    AVOID keeping or importing the old `src/cart/cart.service.ts` or `src/cart/cart.controller.ts` from the original cart/ folder — those files will be superseded. Delete the old cart/ folder files after wiring the new module.
    AVOID using `@Module()` `exports` for infrastructure — it's all internal to CartModule.
  </action>
  <verify>cd apps/cart-service && pnpm install && npx tsc --noEmit 2>&1 | tail -20</verify>
  <done>CartController has exactly 4 routes, each delegating to CommandBus/QueryBus only. CartModule registers CqrsModule + all handlers + all 3 port bindings. AppModule imports new CartModule. ValidationPipe applied globally. pnpm install succeeds with new deps.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` from cart-service shows zero errors
- [ ] `cart.controller.ts` has no business logic — only CommandBus/QueryBus calls
- [ ] Redis TTL is 604800 (7 days), matching ARCHITECTURE.md
- [ ] `cat apps/cart-service/src/cart.module.ts` shows CqrsModule imported
- [ ] Old `src/cart/cart.service.ts` is deleted or unused
</verification>

<success_criteria>
- [ ] All infrastructure adapters created
- [ ] Controller is thin (no logic)
- [ ] Module properly wires all providers with injection tokens
- [ ] `pnpm install` succeeds
- [ ] TypeScript compiles without errors
</success_criteria>
