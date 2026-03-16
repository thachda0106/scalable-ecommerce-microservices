---
phase: 17
plan: 9
wave: 5
---

# Plan 17.9: Tests — Domain, Handler & Cache Unit Tests

## Objective
Write comprehensive unit tests for the domain layer, application handlers, and cache logic.
Verify all business rules, state transitions, and cache-aside behavior are correct.

## Context
- apps/product-service/src/domain/ (from Plan 17.1)
- apps/product-service/src/application/handlers/ (from Plan 17.3)
- apps/order-service/src/domain/entities/__tests__/order.spec.ts (established test pattern)
- apps/order-service/src/application/handlers/__tests__/ (established handler test pattern)
- apps/cart-service/src/application/handlers/__tests__/ (handler test pattern with cache)

## Tasks

<task type="auto">
  <name>Create Domain Layer Unit Tests</name>
  <files>
    apps/product-service/src/domain/entities/__tests__/product.spec.ts
    apps/product-service/src/domain/value-objects/__tests__/product-status.spec.ts
    apps/product-service/src/domain/value-objects/__tests__/money.spec.ts
  </files>
  <action>
    **product.spec.ts** — test Product aggregate:
    - Creates product with valid props (name, price, categoryId)
    - Raises ProductCreatedEvent on creation
    - Rejects creation with empty name
    - Rejects creation with zero/negative price
    - updateDetails() changes name/description/price
    - updateDetails() on ARCHIVED product throws InvalidProductOperationError
    - activate() transitions INACTIVE → ACTIVE
    - deactivate() transitions ACTIVE → INACTIVE
    - markOutOfStock() transitions ACTIVE → OUT_OF_STOCK
    - restock() transitions OUT_OF_STOCK → ACTIVE
    - archive() transitions any non-terminal → ARCHIVED
    - archive() on ARCHIVED throws InvalidProductStatusTransitionError
    - pullDomainEvents() returns and clears events
    - reconstitute() rebuilds without raising events

    **product-status.spec.ts** — test ProductStatus VO:
    - Valid transitions: ACTIVE→INACTIVE, ACTIVE→OUT_OF_STOCK, ACTIVE→ARCHIVED, etc.
    - Invalid transitions: ARCHIVED→ACTIVE (terminal state)
    - canTransitionTo() returns boolean correctly
    - transitionTo() throws on invalid transition
    - isTerminal() returns true for ARCHIVED

    **money.spec.ts** — test Money VO:
    - fromDecimal(10.50) stores 1050 cents
    - toDecimal() returns correct decimal
    - add() combines two Money values
    - multiply() scales correctly
    - zero() creates zero amount
    - equals() compares correctly

    Use jest. Follow existing test patterns from order-service.
  </action>
  <verify>cd apps/product-service && npx jest --testPathPattern="domain" --no-coverage 2>&1 | tail -20</verify>
  <done>Domain unit tests cover Product aggregate lifecycle, ProductStatus transitions, and Money value object operations. All tests pass.</done>
</task>

<task type="auto">
  <name>Create Handler Unit Tests</name>
  <files>
    apps/product-service/src/application/handlers/__tests__/create-product.handler.spec.ts
    apps/product-service/src/application/handlers/__tests__/get-product-by-id.handler.spec.ts
    apps/product-service/src/application/handlers/__tests__/update-product.handler.spec.ts
  </files>
  <action>
    **create-product.handler.spec.ts:**
    - Mock IProductRepository, IEventPublisher, IProductCache, ProductMetricsService
    - Test: creates product and returns ID
    - Test: saves product to repository
    - Test: publishes domain events
    - Test: increments created metric

    **get-product-by-id.handler.spec.ts:**
    - Mock IProductRepository, IProductCache, ProductMetricsService
    - Test: returns product from cache (cache hit)
    - Test: falls through to repo on cache miss, populates cache
    - Test: throws ProductNotFoundError when not in cache or repo
    - Test: records cache hit/miss metrics

    **update-product.handler.spec.ts:**
    - Mock IProductRepository, IEventPublisher, IProductCache, ProductMetricsService
    - Test: updates product details
    - Test: invalidates cache after update
    - Test: publishes ProductUpdatedEvent
    - Test: throws ProductNotFoundError for non-existent product

    Follow established mock pattern from apps/order-service/src/application/handlers/__tests__/.
    Use jest.fn() for all mocked port methods.
  </action>
  <verify>cd apps/product-service && npx jest --testPathPattern="handlers" --no-coverage 2>&1 | tail -20</verify>
  <done>Handler tests cover create, get-by-id (with cache hit/miss), and update flows. All port interactions verified via mocks.</done>
</task>

## Success Criteria
- [ ] Domain tests: Product aggregate lifecycle, status transitions, Money operations
- [ ] Handler tests: Create, GetById (cache-aside), Update with mock ports
- [ ] Cache-aside behavior tested: hit returns cached, miss falls through to repo
- [ ] All tests pass: `cd apps/product-service && pnpm test`
- [ ] `npx tsc --noEmit` still passes
